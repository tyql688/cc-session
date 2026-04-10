use std::collections::HashMap;

use serde::Deserialize;

pub const PRICING_CATALOG_URL: &str =
    "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
pub const PRICING_CATALOG_JSON_KEY: &str = "pricing_catalog_json";
pub const PRICING_CATALOG_UPDATED_AT_KEY: &str = "pricing_catalog_updated_at";

/// Per-token costs in USD sourced from a cached pricing catalog.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ModelPricing {
    pub input: f64,
    pub output: f64,
    pub cache_read: f64,
    pub cache_write: f64,
    pub input_above_threshold: Option<f64>,
    pub output_above_threshold: Option<f64>,
    pub cache_read_above_threshold: Option<f64>,
    pub cache_write_above_threshold: Option<f64>,
    pub threshold_tokens: Option<u64>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct RemoteModelPricing {
    pub input_cost_per_token: Option<f64>,
    pub output_cost_per_token: Option<f64>,
    pub cache_read_input_token_cost: Option<f64>,
    pub cache_creation_input_token_cost: Option<f64>,
    pub input_cost_per_token_above_200k_tokens: Option<f64>,
    pub output_cost_per_token_above_200k_tokens: Option<f64>,
    pub cache_read_input_token_cost_above_200k_tokens: Option<f64>,
    pub cache_creation_input_token_cost_above_200k_tokens: Option<f64>,
}

pub type PricingCatalog = HashMap<String, RemoteModelPricing>;

pub fn parse_catalog(json: &str) -> Option<PricingCatalog> {
    serde_json::from_str(json).ok()
}

fn model_pricing_from_remote(remote: &RemoteModelPricing) -> Option<ModelPricing> {
    let input = remote.input_cost_per_token?;
    let output = remote.output_cost_per_token?;
    let cache_read = remote.cache_read_input_token_cost.unwrap_or(input);
    let cache_write = remote.cache_creation_input_token_cost.unwrap_or(input);

    Some(ModelPricing {
        input,
        output,
        cache_read,
        cache_write,
        input_above_threshold: remote.input_cost_per_token_above_200k_tokens,
        output_above_threshold: remote.output_cost_per_token_above_200k_tokens,
        cache_read_above_threshold: remote.cache_read_input_token_cost_above_200k_tokens,
        cache_write_above_threshold: remote.cache_creation_input_token_cost_above_200k_tokens,
        threshold_tokens: remote
            .input_cost_per_token_above_200k_tokens
            .or(remote.output_cost_per_token_above_200k_tokens)
            .or(remote.cache_read_input_token_cost_above_200k_tokens)
            .or(remote.cache_creation_input_token_cost_above_200k_tokens)
            .map(|_| 200_000),
    })
}

pub fn lookup_pricing_in_catalog(catalog: &PricingCatalog, model: &str) -> Option<ModelPricing> {
    let normalized = model.trim().to_lowercase();
    if let Some(remote) = catalog.get(&normalized) {
        if let Some(pricing) = model_pricing_from_remote(remote) {
            return Some(pricing);
        }
    }

    catalog.iter().find_map(|(name, remote)| {
        let candidate = name.to_lowercase();
        if candidate == normalized
            || candidate.contains(&normalized)
            || normalized.contains(&candidate)
        {
            model_pricing_from_remote(remote)
        } else {
            None
        }
    })
}

pub fn estimate_cost_with_catalog(
    catalog: Option<&PricingCatalog>,
    model: &str,
    input: u64,
    output: u64,
    cache_read: u64,
    cache_write: u64,
) -> f64 {
    let Some(p) = catalog.and_then(|catalog| lookup_pricing_in_catalog(catalog, model)) else {
        return 0.0;
    };
    component_cost(input, p.input, p.input_above_threshold, p.threshold_tokens)
        + component_cost(
            output,
            p.output,
            p.output_above_threshold,
            p.threshold_tokens,
        )
        + component_cost(
            cache_read,
            p.cache_read,
            p.cache_read_above_threshold,
            p.threshold_tokens,
        )
        + component_cost(
            cache_write,
            p.cache_write,
            p.cache_write_above_threshold,
            p.threshold_tokens,
        )
}

fn component_cost(
    tokens: u64,
    base_price: f64,
    above_threshold_price: Option<f64>,
    threshold_tokens: Option<u64>,
) -> f64 {
    if tokens == 0 {
        return 0.0;
    }
    match (above_threshold_price, threshold_tokens) {
        (Some(above), Some(threshold)) if tokens > threshold => {
            let below = threshold as f64 * base_price;
            let above_tokens = (tokens - threshold) as f64 * above;
            below + above_tokens
        }
        _ => tokens as f64 * base_price,
    }
}

#[cfg(test)]
mod tests {
    use super::{estimate_cost_with_catalog, parse_catalog};

    fn assert_close(actual: f64, expected: f64) {
        assert!((actual - expected).abs() < 1e-12, "{actual} != {expected}");
    }

    #[test]
    fn parse_catalog_and_lookup_exact_model() {
        let catalog = parse_catalog(
            r#"{"gpt-5.4":{"input_cost_per_token":2.5e-6,"output_cost_per_token":15e-6,"cache_read_input_token_cost":2.5e-7}}"#,
        )
        .expect("catalog");
        let pricing = super::lookup_pricing_in_catalog(&catalog, "gpt-5.4").expect("pricing");
        assert_close(pricing.input, 2.5e-6);
        assert_close(pricing.output, 15.0e-6);
        assert_close(pricing.cache_read, 0.25e-6);
        assert_eq!(pricing.threshold_tokens, None);
    }

    #[test]
    fn estimate_cost_handles_tiered_pricing() {
        let catalog = parse_catalog(
            r#"{"claude-sonnet-4-5":{"input_cost_per_token":3e-6,"output_cost_per_token":15e-6,"cache_read_input_token_cost":3e-7,"cache_creation_input_token_cost":3.75e-6,"input_cost_per_token_above_200k_tokens":6e-6,"output_cost_per_token_above_200k_tokens":22.5e-6,"cache_read_input_token_cost_above_200k_tokens":6e-7,"cache_creation_input_token_cost_above_200k_tokens":7.5e-6}}"#,
        )
        .expect("catalog");
        let cost = estimate_cost_with_catalog(
            Some(&catalog),
            "claude-sonnet-4-5",
            300_000,
            250_000,
            250_000,
            300_000,
        );
        let expected = (200_000.0 * 3e-6)
            + (100_000.0 * 6e-6)
            + (200_000.0 * 15e-6)
            + (50_000.0 * 22.5e-6)
            + (200_000.0 * 0.3e-6)
            + (50_000.0 * 0.6e-6)
            + (200_000.0 * 3.75e-6)
            + (100_000.0 * 7.5e-6);
        assert!((cost - expected).abs() < 1e-12);
    }

    #[test]
    fn estimate_cost_uses_cache_components() {
        let catalog = parse_catalog(
            r#"{"kimi-k2.5":{"input_cost_per_token":0.6e-6,"output_cost_per_token":3e-6,"cache_read_input_token_cost":0.1e-6,"cache_creation_input_token_cost":0.6e-6}}"#,
        )
        .expect("catalog");
        let cost = estimate_cost_with_catalog(Some(&catalog), "kimi-k2.5", 100, 50, 20, 10);
        let expected = (100.0 * 0.6e-6) + (50.0 * 3.0e-6) + (20.0 * 0.1e-6) + (10.0 * 0.6e-6);
        assert!((cost - expected).abs() < 1e-12);
    }
}

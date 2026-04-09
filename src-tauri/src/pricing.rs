/// Per-token costs in USD. Values from LiteLLM model_prices JSON (April 2026).
pub struct ModelPricing {
    pub input: f64,
    pub output: f64,
    pub cache_read: f64,
    pub cache_write: f64,
}

/// Look up pricing by model name substring matching.
pub fn lookup_pricing(model: &str) -> Option<ModelPricing> {
    let m = model.to_lowercase();

    // Claude (Anthropic)
    if m.contains("opus-4-6") || m.contains("opus-4-5") {
        return Some(ModelPricing {
            input: 5e-6,
            output: 25e-6,
            cache_read: 5e-7,
            cache_write: 6.25e-6,
        });
    }
    if m.contains("opus-4-1") || m.contains("opus-4-0") || m.contains("opus-3") {
        return Some(ModelPricing {
            input: 15e-6,
            output: 75e-6,
            cache_read: 1.5e-6,
            cache_write: 18.75e-6,
        });
    }
    if m.contains("sonnet") {
        return Some(ModelPricing {
            input: 3e-6,
            output: 15e-6,
            cache_read: 3e-7,
            cache_write: 3.75e-6,
        });
    }
    if m.contains("haiku") {
        return Some(ModelPricing {
            input: 1e-6,
            output: 5e-6,
            cache_read: 1e-7,
            cache_write: 1.25e-6,
        });
    }

    // OpenAI / Codex
    if m.contains("codex-mini") {
        return Some(ModelPricing {
            input: 1.5e-6,
            output: 6e-6,
            cache_read: 3.75e-7,
            cache_write: 0.0,
        });
    }
    if m.contains("gpt-5.3") || m.contains("gpt-5.1-codex") {
        return Some(ModelPricing {
            input: 1.75e-6,
            output: 14e-6,
            cache_read: 4.375e-7,
            cache_write: 0.0,
        });
    }
    if m.contains("gpt-5") {
        return Some(ModelPricing {
            input: 1.25e-6,
            output: 10e-6,
            cache_read: 3.125e-7,
            cache_write: 0.0,
        });
    }

    // Google Gemini
    if m.contains("gemini-2.5-pro") || m.contains("gemini-2-5-pro") {
        return Some(ModelPricing {
            input: 1.25e-6,
            output: 10e-6,
            cache_read: 3.125e-7,
            cache_write: 0.0,
        });
    }
    if m.contains("gemini-2.5-flash") || m.contains("gemini-2-5-flash") {
        return Some(ModelPricing {
            input: 3e-7,
            output: 2.5e-6,
            cache_read: 7.5e-8,
            cache_write: 0.0,
        });
    }
    if m.contains("gemini-3") {
        return Some(ModelPricing {
            input: 2e-6,
            output: 12e-6,
            cache_read: 5e-7,
            cache_write: 0.0,
        });
    }

    // Moonshot Kimi
    if m.contains("kimi-k2.5") {
        return Some(ModelPricing {
            input: 6e-7,
            output: 3e-6,
            cache_read: 1.5e-7,
            cache_write: 0.0,
        });
    }
    if m.contains("kimi-k2") {
        return Some(ModelPricing {
            input: 6e-7,
            output: 2.5e-6,
            cache_read: 1.5e-7,
            cache_write: 0.0,
        });
    }

    // Alibaba Qwen
    if m.contains("qwen") {
        return Some(ModelPricing {
            input: 4e-7,
            output: 1.2e-6,
            cache_read: 1e-7,
            cache_write: 0.0,
        });
    }

    None
}

/// Calculate estimated cost for given token counts and model.
pub fn estimate_cost(
    model: &str,
    input: u64,
    output: u64,
    cache_read: u64,
    cache_write: u64,
) -> f64 {
    let Some(p) = lookup_pricing(model) else {
        return 0.0;
    };
    (input as f64 * p.input)
        + (output as f64 * p.output)
        + (cache_read as f64 * p.cache_read)
        + (cache_write as f64 * p.cache_write)
}

pub fn contains_image_source(text: &str) -> bool {
    text.contains("[Image: source:")
}

pub fn contains_image_placeholder_without_source(text: &str) -> bool {
    text.contains("[Image") && !contains_image_source(text)
}

pub fn merge_image_placeholders_with_sources(placeholder_text: &str, meta_text: &str) -> String {
    let sources = extract_image_source_segments(meta_text);
    if sources.is_empty() {
        return placeholder_text.to_string();
    }

    let mut merged = String::new();
    let mut remaining = placeholder_text;
    let mut source_index = 0usize;

    while let Some(start) = remaining.find("[Image") {
        merged.push_str(&remaining[..start]);
        let image_slice = &remaining[start..];
        let Some(end_offset) = image_slice.find(']') else {
            merged.push_str(image_slice);
            remaining = "";
            break;
        };

        let candidate = &image_slice[..=end_offset];
        if source_index < sources.len() && is_image_placeholder(candidate) {
            merged.push_str(&sources[source_index]);
            source_index += 1;
        } else {
            merged.push_str(candidate);
        }

        remaining = &image_slice[end_offset + 1..];
    }

    merged.push_str(remaining);

    if source_index < sources.len() {
        if !merged.is_empty() && !merged.ends_with('\n') {
            merged.push('\n');
        }
        merged.push_str(&sources[source_index..].join("\n"));
    }

    merged
}

pub fn extract_image_source_segments(text: &str) -> Vec<String> {
    let mut segments = Vec::new();
    let mut remaining = text;

    while let Some(start) = remaining.find("[Image") {
        let image_slice = &remaining[start..];
        let Some(end_offset) = image_slice.find(']') else {
            break;
        };

        let candidate = &image_slice[..=end_offset];
        if contains_image_source(candidate) {
            segments.push(candidate.to_string());
        }

        remaining = &image_slice[end_offset + 1..];
    }

    segments
}

pub fn is_image_placeholder(segment: &str) -> bool {
    segment.starts_with("[Image") && !segment.contains("source:")
}

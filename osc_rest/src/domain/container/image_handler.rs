pub fn repository_tag(reference: &str) -> (&str, &str) {
    match reference.rsplit_once(':') {
        Some((repository, tag)) if !tag.contains('/') => (repository, tag),
        _ => (reference, "latest"),
    }
}

pub enum FilterExpr {
    All,
    Exact(String),
    Condition(Vec<FilterClause>),
}

pub struct FilterClause {
    pub conditions: Vec<FilterCondition>,
}

pub struct FilterCondition {
    pub negated: bool,
    pub filter_type: FilterType,
    pub value: String,
}

pub enum FilterType {
    Type,
    Tag,
    Language,
    Test,
    Status,
}

pub struct IndexerInfo<'a> {
    pub id: &'a str,
    pub name: &'a str,
    pub indexer_type: &'a str,
    pub tags: &'a [String],
    pub language: &'a str,
    pub is_healthy: Option<bool>,
}

impl FilterExpr {
    pub fn parse(input: &str) -> Self {
        if input == "all" {
            return FilterExpr::All;
        }

        // Check if it looks like a complex filter (contains operators or known prefixes)
        let is_complex = input.contains(',')
            || input.contains('+')
            || input.contains('!')
            || input.starts_with("type:")
            || input.starts_with("tag:")
            || input.starts_with("lang:")
            || input.starts_with("test:")
            || input.starts_with("status:");

        if !is_complex {
            return FilterExpr::Exact(input.to_string());
        }

        let mut clauses = Vec::new();
        for or_part in input.split(',') {
            let mut conditions = Vec::new();
            for and_part in or_part.split('+') {
                let and_part = and_part.trim();
                if and_part.is_empty() {
                    continue;
                }

                let negated = and_part.starts_with('!');
                let term = if negated { &and_part[1..] } else { and_part };

                let parts: Vec<&str> = term.splitn(2, ':').collect();
                if parts.len() == 2 {
                    let ftype = match parts[0] {
                        "type" => FilterType::Type,
                        "tag" => FilterType::Tag,
                        "lang" => FilterType::Language,
                        "test" => FilterType::Test,
                        "status" => FilterType::Status,
                        _ => continue, // Unknown prefix, maybe ignore or treat as exact match later
                    };
                    conditions.push(FilterCondition {
                        negated,
                        filter_type: ftype,
                        value: parts[1].to_lowercase(),
                    });
                }
            }
            if !conditions.is_empty() {
                clauses.push(FilterClause { conditions });
            }
        }

        if clauses.is_empty() {
            // Fallback
            FilterExpr::Exact(input.to_string())
        } else {
            FilterExpr::Condition(clauses)
        }
    }

    pub fn matches(&self, indexer: &IndexerInfo) -> bool {
        match self {
            FilterExpr::All => true,
            FilterExpr::Exact(name) => indexer.name == *name || indexer.id == *name,
            FilterExpr::Condition(or_groups) => or_groups.iter().any(|clause| {
                clause.conditions.iter().all(|cond| {
                    let matches = match cond.filter_type {
                        FilterType::Type => indexer.indexer_type.to_lowercase() == cond.value,
                        FilterType::Tag => {
                            indexer.tags.iter().any(|t| t.to_lowercase() == cond.value)
                        }
                        FilterType::Language => {
                            indexer.language.to_lowercase().starts_with(&cond.value)
                        }
                        FilterType::Test => match indexer.is_healthy {
                            Some(true) => cond.value == "passed",
                            Some(false) => cond.value == "failed",
                            None => false,
                        },
                        FilterType::Status => match indexer.is_healthy {
                            Some(true) => cond.value == "healthy",
                            Some(false) => cond.value == "failing",
                            None => cond.value == "unknown",
                        },
                    };
                    if cond.negated { !matches } else { matches }
                })
            }),
        }
    }
}

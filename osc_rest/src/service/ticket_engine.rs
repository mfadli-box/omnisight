use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TicketType {
    Incident,
    ServiceRequest,
}

impl TicketType {
    fn prefix(self) -> &'static str {
        match self {
            Self::Incident => "INC",
            Self::ServiceRequest => "REQ",
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NewTicket {
    ticket_type: TicketType,
    category: String,
    title: String,
    description: String,
    area_id: Option<Uuid>,
    assignee_id: Option<Uuid>,
    priority: Option<String>,
}

#[derive(Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
pub struct Attachment {
    attachment_id: Uuid,
    file_name: String,
}

#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub struct Change {
    status: Option<String>,
    assignee_id: Option<Uuid>,
    #[serde(default)]
    unassign: bool,
    comment: Option<String>,
    attachment: Option<Attachment>,
}

#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Filters {
    status: Option<String>,
    priority: Option<String>,
    #[serde(alias = "assignee")]
    assignee_id: Option<Uuid>,
}

#[derive(Debug)]
pub enum Error {
    Invalid,
    Conflict,
    Database(sqlx::Error),
}
impl From<sqlx::Error> for Error {
    fn from(error: sqlx::Error) -> Self {
        Self::Database(error)
    }
}

type Tx<'a> = Transaction<'a, Postgres>;
const STATUSES: [&str; 5] = [
    "OPEN",
    "IN_PROGRESS",
    "PENDING_VENDOR",
    "RESOLVED",
    "CLOSED",
];
const PRIORITIES: [&str; 5] = ["LOW", "MEDIUM", "HIGH", "URGENT", "CRITICAL"];
const VISIBLE: &str = "t.company_id=$1 AND (t.area_id IS NULL OR EXISTS (
    SELECT FROM trx_user_area a WHERE a.user_id=$2 AND a.company_id=t.company_id AND a.area_id=t.area_id))";

fn valid_text(s: &str, limit: usize) -> bool {
    !s.trim().is_empty() && s.chars().count() <= limit && !s.contains('\0')
}

fn transition(from: &str, to: &str) -> bool {
    STATUSES.windows(2).any(|pair| pair == [from, to])
}

async fn member(
    tx: &mut Tx<'_>,
    company: Uuid,
    user: Uuid,
    area: Option<Uuid>,
) -> Result<(), Error> {
    sqlx::query("SELECT 1 FROM trx_user_company WHERE company_id=$1 AND user_id=$2 FOR SHARE")
        .bind(company)
        .bind(user)
        .fetch_one(&mut **tx)
        .await?;
    if let Some(area) = area {
        sqlx::query("SELECT 1 FROM trx_user_area a JOIN dat_area d ON d.area_id=a.area_id AND d.company_id=a.company_id
            WHERE a.company_id=$1 AND a.user_id=$2 AND a.area_id=$3 FOR SHARE OF a,d")
            .bind(company).bind(user).bind(area).fetch_one(&mut **tx).await?;
    }
    Ok(())
}

async fn audit(
    tx: &mut Tx<'_>,
    id: Uuid,
    actor: Uuid,
    event: &str,
    details: Value,
) -> Result<(), Error> {
    sqlx::query("INSERT INTO log_ticket_activity(ticket_id,actor_id,event_type,details) VALUES ($1,$2,$3,$4)")
        .bind(id).bind(actor).bind(event).bind(details).execute(&mut **tx).await?;
    Ok(())
}

pub async fn create(
    db: &PgPool,
    company: Uuid,
    actor: Uuid,
    input: NewTicket,
) -> Result<Value, Error> {
    let priority = input.priority.as_deref().unwrap_or("MEDIUM");
    if !PRIORITIES.contains(&priority)
        || !valid_text(&input.title, 200)
        || !valid_text(&input.description, 16000)
        || !valid_text(&input.category, 50)
    {
        return Err(Error::Invalid);
    }
    let mut tx = db.begin().await?;
    member(&mut tx, company, actor, input.area_id).await?;
    if let Some(user) = input.assignee_id {
        member(&mut tx, company, user, input.area_id).await?;
    }
    let prefix = input.ticket_type.prefix();
    let (date, sequence): (String, i64) = sqlx::query_as(
        "INSERT INTO trx_ticket_sequence(prefix,month_key,last_number)
        VALUES ($1,to_char(now() AT TIME ZONE 'UTC','YYYYMM'),1)
        ON CONFLICT (prefix,month_key) DO UPDATE SET last_number=trx_ticket_sequence.last_number+1
        RETURNING to_char(now() AT TIME ZONE 'UTC','YYYYMMDD'),last_number",
    )
    .bind(prefix)
    .fetch_one(&mut *tx)
    .await?;
    let number = format!("{prefix}-{date}-{sequence:03}");
    let (id,ticket):(Uuid,Value)=sqlx::query_as("INSERT INTO trx_ticket_issue AS t
        (ticket_number,company_id,area_id,reporter_id,assignee_id,category,title,description,priority,status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'OPEN') RETURNING id,to_jsonb(t)")
        .bind(number).bind(company).bind(input.area_id).bind(actor).bind(input.assignee_id)
        .bind(input.category.trim()).bind(input.title.trim()).bind(input.description.trim()).bind(priority).fetch_one(&mut *tx).await?;
    audit(&mut tx, id, actor, "CREATED", ticket.clone()).await?;
    tx.commit().await?;
    Ok(ticket)
}

pub async fn list(
    db: &PgPool,
    company: Uuid,
    actor: Uuid,
    f: Filters,
) -> Result<Vec<Value>, Error> {
    if f.status.as_deref().is_some_and(|s| !STATUSES.contains(&s))
        || f.priority
            .as_deref()
            .is_some_and(|s| !PRIORITIES.contains(&s))
    {
        return Err(Error::Invalid);
    }
    let sql = format!(
        "SELECT to_jsonb(t) FROM trx_ticket_issue t WHERE {VISIBLE}
        AND ($3::text IS NULL OR t.status=$3) AND ($4::text IS NULL OR t.priority=$4)
        AND ($5::uuid IS NULL OR t.assignee_id=$5) ORDER BY t.created_at DESC,t.id"
    );
    Ok(sqlx::query_scalar(&sql)
        .bind(company)
        .bind(actor)
        .bind(f.status)
        .bind(f.priority)
        .bind(f.assignee_id)
        .fetch_all(db)
        .await?)
}

pub async fn change(
    db: &PgPool,
    company: Uuid,
    actor: Uuid,
    id: Uuid,
    input: Change,
) -> Result<Value, Error> {
    if input.unassign && input.assignee_id.is_some()
        || input
            .status
            .as_deref()
            .is_some_and(|s| !STATUSES.contains(&s))
        || input
            .comment
            .as_deref()
            .is_some_and(|s| !valid_text(s, 8000))
        || input.attachment.as_ref().is_some_and(|a| {
            !valid_text(&a.file_name, 255)
                || a.file_name.contains(['/', '\\'])
                || a.file_name.chars().any(char::is_control)
        })
        || (input.status.is_none()
            && input.assignee_id.is_none()
            && !input.unassign
            && input.comment.is_none()
            && input.attachment.is_none())
    {
        return Err(Error::Invalid);
    }
    let mut tx = db.begin().await?;
    let sql=format!("SELECT area_id,status,assignee_id FROM trx_ticket_issue t WHERE {VISIBLE} AND t.id=$3 FOR UPDATE");
    let (area, old, previous): (Option<Uuid>, String, Option<Uuid>) = sqlx::query_as(&sql)
        .bind(company)
        .bind(actor)
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
    member(&mut tx, company, actor, area).await?;
    let status = input.status.as_deref().unwrap_or(&old);
    if status != old && !transition(&old, status) {
        return Err(Error::Conflict);
    }
    let assignee = if input.unassign {
        None
    } else {
        input.assignee_id.or(previous)
    };
    if let Some(user) = input.assignee_id {
        member(&mut tx, company, user, area).await?;
    }
    if status != old {
        audit(
            &mut tx,
            id,
            actor,
            "STATUS_CHANGED",
            json!({"from":old,"to":status}),
        )
        .await?;
    }
    if previous != assignee {
        audit(
            &mut tx,
            id,
            actor,
            "REASSIGNED",
            json!({"from":previous,"to":assignee}),
        )
        .await?;
    }
    if let Some(comment) = &input.comment {
        audit(
            &mut tx,
            id,
            actor,
            "COMMENT_ADDED",
            json!({"comment":comment.trim()}),
        )
        .await?;
    }
    if let Some(a) = &input.attachment {
        audit(&mut tx, id, actor, "ATTACHMENT_ADDED", json!(a)).await?;
    }
    let modified = status != old
        || previous != assignee
        || input.comment.is_some()
        || input.attachment.is_some();
    let ticket = if modified {
        sqlx::query_scalar("UPDATE trx_ticket_issue AS t SET status=$2,assignee_id=$3,updated_at=clock_timestamp(),
            resolved_at=CASE WHEN status <> $2 AND $2='RESOLVED' THEN clock_timestamp() ELSE resolved_at END
            WHERE id=$1 RETURNING to_jsonb(t)").bind(id).bind(status).bind(assignee).fetch_one(&mut *tx).await?
    } else {
        sqlx::query_scalar("SELECT to_jsonb(t) FROM trx_ticket_issue t WHERE id=$1")
            .bind(id)
            .fetch_one(&mut *tx)
            .await?
    };
    tx.commit().await?;
    Ok(ticket)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_adjacent_forward_transitions() {
        for from in STATUSES {
            for to in STATUSES {
                let expected = matches!(
                    (from, to),
                    ("OPEN", "IN_PROGRESS")
                        | ("IN_PROGRESS", "PENDING_VENDOR")
                        | ("PENDING_VENDOR", "RESOLVED")
                        | ("RESOLVED", "CLOSED")
                );
                assert_eq!(transition(from, to), expected, "{from} -> {to}");
            }
        }
    }

    #[test]
    fn validate_unicode_length_and_reject_empty_or_nul() {
        assert!(valid_text("é", 1));
        assert!(!valid_text("éé", 1));
        assert!(!valid_text("   ", 3));
        assert!(!valid_text("a\0", 2));
    }
}

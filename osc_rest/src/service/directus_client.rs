use reqwest::{redirect::Policy, Client, Method, RequestBuilder, Url};
use serde::Deserialize;
use serde_json::json;
use std::{collections::BTreeMap, time::Duration};

use super::work_logger::{valid_name, Error, Notes, MAX_NOTE};

#[derive(Clone)]
pub struct Directus {
    http: Client,
    items: Url,
    token: String,
}

#[derive(Deserialize)]
struct Rows {
    data: Vec<Row>,
}

#[derive(Deserialize)]
struct Row {
    filename: String,
    markdown: String,
}

impl Directus {
    pub fn new(base: &str, token: String) -> Result<Self, &'static str> {
        let mut items = Url::parse(base).map_err(|_| "invalid DIRECTUS_URL")?;
        if !matches!(items.scheme(), "http" | "https")
            || items.host_str().is_none()
            || !items.username().is_empty()
            || items.password().is_some()
            || items.query().is_some()
            || items.fragment().is_some()
            || token.trim().is_empty()
        {
            return Err("invalid Directus configuration");
        }
        items
            .path_segments_mut()
            .map_err(|_| "invalid DIRECTUS_URL")?
            .pop_if_empty()
            .extend(["items", "osc_ai_work_logs"]);
        let http = Client::builder()
            .redirect(Policy::none())
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|_| "invalid Directus client")?;
        Ok(Self { http, items, token })
    }

    fn request(&self, method: Method) -> RequestBuilder {
        self.http
            .request(method, self.items.clone())
            .bearer_auth(&self.token)
    }

    async fn send(request: RequestBuilder) -> Result<Vec<u8>, Error> {
        let mut response = request.send().await.map_err(|_| Error::Remote)?;
        if !response.status().is_success() {
            tracing::warn!(
                status = response.status().as_u16(),
                "AG02 Directus request failed"
            );
            return Err(Error::Remote);
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| Error::Remote)? {
            if bytes.len() + chunk.len() > 8 * MAX_NOTE {
                return Err(Error::Remote);
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(bytes)
    }

    pub async fn list(&self) -> Result<Notes, Error> {
        let mut notes = BTreeMap::new();
        let mut offset = 0;
        loop {
            let request = self.request(Method::GET).query(&[
                ("fields", "filename,markdown"),
                ("sort", "filename"),
                ("limit", "5"),
                ("offset", &offset.to_string()),
            ]);
            let rows: Rows =
                serde_json::from_slice(&Self::send(request).await?).map_err(|_| Error::Remote)?;
            if rows.data.is_empty() {
                return Ok(notes);
            }
            offset += rows.data.len();
            for row in rows.data {
                if !valid_name(&row.filename)
                    || row.markdown.len() > MAX_NOTE
                    || notes.insert(row.filename, row.markdown).is_some()
                {
                    return Err(Error::Remote);
                }
            }
        }
    }

    pub async fn push(
        &self,
        name: &str,
        content: &str,
        previous: Option<&str>,
    ) -> Result<(), Error> {
        let (method, body) = match previous {
            Some(old) => (
                Method::PATCH,
                json!({"query":{"filter":{"filename":{"_eq":name},"markdown":{"_eq":old}}},"data":{"markdown":content}}),
            ),
            None => (Method::POST, json!({"filename":name,"markdown":content})),
        };
        let bytes = Self::send(
            self.request(method)
                .query(&[("fields", "filename")])
                .header("content-type", "application/json")
                .body(body.to_string()),
        )
        .await?;
        if previous.is_some() {
            let result: serde_json::Value =
                serde_json::from_slice(&bytes).map_err(|_| Error::Remote)?;
            if result["data"]
                .as_array()
                .is_none_or(|rows| rows.len() != 1 || rows[0]["filename"] != name)
            {
                return Err(Error::Conflict);
            }
        }
        Ok(())
    }
}

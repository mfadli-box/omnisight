pub mod api {
    pub mod auth;
    pub mod tenant;
}
pub mod application;
pub mod domain {
    pub mod auth {
        pub mod hris_client;
    }
}
pub mod infrastructure {
    pub mod hris;
}
pub mod middleware {
    pub mod audit;
    pub mod rbac;
}

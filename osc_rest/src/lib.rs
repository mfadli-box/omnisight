pub mod domain {
    pub mod container {
        pub mod terminal_handler;
        pub mod image_handler;
    }
    pub mod auth {
        pub mod hris_client;
    }
}
pub mod infrastructure {
    pub mod hris;
    pub(crate) mod store_vault;
}
pub mod application;
pub mod middleware {
    pub mod audit;
    pub mod rbac;
}
pub mod api {
    pub mod auth;
    pub mod directus;
    pub mod mcp;
    pub mod ticket;
    pub mod sla;
    pub mod dcim;
    pub mod alert;
    pub mod system_setting;
    pub mod docker_engine;
    pub mod container_terminal;
    mod container_images;
    pub mod ipam;
    pub mod uptime;
    pub mod snmp;
    pub mod pam_ssh;
    pub mod rbac_permission;
    pub mod store_asset;
    pub mod store_cmdb;
    pub mod tenant_master;
}
pub mod service {
    pub mod directus_client;
    pub mod work_logger;
    pub mod mcp_gateway;
    pub mod ticket_engine;
    pub mod sla_worker;
    pub mod dcim_calculator;
    pub mod alert_engine;
    pub mod notifier;
    pub mod log_rotator;
    pub mod nginx_generator;
    pub mod ipam_scanner;
    pub mod uptime_checker;
    pub mod snmp_poller;
}

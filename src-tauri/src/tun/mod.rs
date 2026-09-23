
#[cfg(target_os = "windows")]
pub mod adapter;
#[cfg(target_os = "windows")]
pub mod cleanup;
#[cfg(target_os = "windows")]
pub mod dns;
#[cfg(target_os = "windows")]
pub mod forwarder;
#[cfg(target_os = "windows")]
pub mod route;

use thiserror::Error;

#[derive(Error, Debug)]
pub enum TunError {
    #[error("failed to create TUN adapter: {0}")]
    AdapterCreate(String),

    #[error("failed to manipulate routes: {0}")]
    RouteError(String),

    #[error("failed to start forwarder: {0}")]
    ForwarderError(String),

    #[error("TUN adapter not active")]
    NotActive,

    #[error("internal error: {0}")]
    Internal(String),
}

impl serde::Serialize for TunError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[cfg(target_os = "windows")]
mod manager {
    use super::*;
    use std::sync::Arc;
    use std::thread::{self, JoinHandle};

    pub struct TunManager {
        adapter: Option<Arc<adapter::TunAdapter>>,
        route_manager: Option<route::RouteManager>,
        forwarder_handle: Option<JoinHandle<()>>,
    }

    impl TunManager {
        pub fn new() -> Self {
            Self {
                adapter: None,
                route_manager: None,
                forwarder_handle: None,
            }
        }

        pub fn activate(
            &mut self,
            socks_addr: &str,
            profile: &crate::aether::profiles::ConnectionProfile,
            resource_dir: Option<&std::path::Path>,
        ) -> Result<(), TunError> {
            if self.adapter.is_some() {
                return Err(TunError::NotActive);
            }

            let addr: std::net::SocketAddr = socks_addr
                .parse()
                .map_err(|e| TunError::Internal(format!("invalid SOCKS5 address: {e}")))?;

            let tun_name = "Aether";
            let tun_addr = &profile.tun_address;
            let tun_adapter = adapter::TunAdapter::create(tun_name, tun_addr, resource_dir)
                .map_err(TunError::AdapterCreate)?;
            let tun_adapter = Arc::new(tun_adapter);

            let mut route_mgr =
                route::RouteManager::save_current_state().map_err(TunError::RouteError)?;

            route_mgr
                .redirect_default_through_tun(&tun_adapter)
                .map_err(TunError::RouteError)?;

            let forwarder_adapter = Arc::clone(&tun_adapter);
            let dns_mode = profile.dns_mode.clone();
            let forwarder_socks = addr;

            let handle = thread::Builder::new()
                .name("tun-forwarder".into())
                .spawn(move || {
                    forwarder::run_forwarder(forwarder_adapter, forwarder_socks, dns_mode);
                })
                .map_err(|e| TunError::ForwarderError(e.to_string()))?;

            self.adapter = Some(tun_adapter);
            self.route_manager = Some(route_mgr);
            self.forwarder_handle = Some(handle);

            Ok(())
        }

        pub fn deactivate(&mut self) -> Result<(), TunError> {
            if let Some(adapter) = self.adapter.as_ref() {
                adapter.shutdown();
            }

            if let Some(handle) = self.forwarder_handle.take() {
                let _ = handle.join();
            }

            if let Some(mut route_mgr) = self.route_manager.take() {
                route_mgr.restore().map_err(TunError::RouteError)?;
            }

            self.adapter.take();
            Ok(())
        }

        pub fn is_active(&self) -> bool {
            self.adapter.is_some()
        }
    }

    impl Default for TunManager {
        fn default() -> Self {
            Self::new()
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod manager {
    use super::*;

    pub struct TunManager {
        _private: (),
    }

    impl TunManager {
        pub fn new() -> Self {
            Self { _private: () }
        }

        pub fn activate(
            &mut self,
            _socks_addr: &str,
            _profile: &crate::aether::profiles::ConnectionProfile,
            _resource_dir: Option<&std::path::Path>,
        ) -> Result<(), TunError> {
            Ok(())
        }

        pub fn deactivate(&mut self) -> Result<(), TunError> {
            Ok(())
        }

        pub fn is_active(&self) -> bool {
            false
        }
    }

    impl Default for TunManager {
        fn default() -> Self {
            Self::new()
        }
    }
}

pub use manager::TunManager;

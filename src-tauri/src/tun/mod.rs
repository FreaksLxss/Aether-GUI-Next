pub mod adapter;
pub mod cleanup;
pub mod dns;
pub mod forwarder;
pub mod route;

use std::sync::Arc;
use std::thread::{self, JoinHandle};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum TunError {
    #[error("failed to create TUN adapter: {0}")]
    AdapterCreate(String),

    #[error("failed to configure TUN adapter: {0}")]
    AdapterConfig(String),

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

/// Manages the lifecycle of a wintun TUN adapter, route manipulation,
/// and the packet forwarder. Activated after Aether's SOCKS5 proxy is
/// confirmed live; deactivated before Ctrl-C is sent to Aether.
pub struct TunManager {
    adapter: Option<Arc<adapter::TunAdapter>>,
    route_manager: Option<route::RouteManager>,
    forwarder_handle: Option<JoinHandle<()>>,
    socks_addr: Option<std::net::SocketAddr>,
}

impl TunManager {
    pub fn new() -> Self {
        Self {
            adapter: None,
            route_manager: None,
            forwarder_handle: None,
            socks_addr: None,
        }
    }

    /// Activate TUN mode: create adapter, set up routes, start forwarder.
    /// Must be called AFTER the SOCKS5 proxy is confirmed live.
    /// `resource_dir` is the Tauri resource directory for finding bundled DLLs.
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

        // Create the wintun adapter
        let tun_name = "Aether";
        let tun_addr = &profile.tun_address;
        let tun_adapter = adapter::TunAdapter::create(tun_name, tun_addr, resource_dir)
            .map_err(TunError::AdapterCreate)?;
        let tun_adapter = Arc::new(tun_adapter);

        // Set up routes
        let mut route_mgr = route::RouteManager::save_current_state()
            .map_err(TunError::RouteError)?;

        route_mgr
            .redirect_default_through_tun(&tun_adapter)
            .map_err(TunError::RouteError)?;

        // Start the packet forwarder thread
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
        self.socks_addr = Some(addr);

        Ok(())
    }

    /// Deactivate TUN mode: stop forwarder, restore routes, destroy adapter.
    /// Must be called BEFORE sending Ctrl-C to Aether.
    pub fn deactivate(&mut self) -> Result<(), TunError> {
        // Shutdown the adapter (unblocks the forwarder's receive_blocking)
        if let Some(adapter) = self.adapter.as_ref() {
            adapter.shutdown();
        }

        // Wait for forwarder thread to finish
        if let Some(handle) = self.forwarder_handle.take() {
            let _ = handle.join();
        }

        // Restore original routes
        if let Some(mut route_mgr) = self.route_manager.take() {
            route_mgr.restore().map_err(TunError::RouteError)?;
        }

        // Drop the adapter
        self.adapter.take();
        self.socks_addr = None;
        Ok(())
    }

    pub fn is_active(&self) -> bool {
        self.adapter.is_some()
    }

    pub fn socks_addr(&self) -> Option<std::net::SocketAddr> {
        self.socks_addr
    }
}

impl Default for TunManager {
    fn default() -> Self {
        Self::new()
    }
}

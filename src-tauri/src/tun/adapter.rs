use std::net::Ipv4Addr;
use std::sync::Arc;

/// A wintun-based TUN adapter that creates a virtual network interface
/// and provides raw IP packet read/write access.
pub struct TunAdapter {
    wintun: wintun::Wintun,
    adapter: Arc<wintun::Adapter>,
    session: Arc<wintun::Session>,
}

impl TunAdapter {
    /// Create a new wintun adapter with the given name and IP address.
    /// `address` should be in CIDR notation, e.g. "10.0.0.2/24".
    /// `resource_dir` is the Tauri resource directory where bundled files are extracted.
    pub fn create(
        name: &str,
        address: &str,
        resource_dir: Option<&std::path::Path>,
    ) -> Result<Self, String> {
        // Parse the CIDR address
        let (ip, _prefix_len) = parse_cidr(address)?;

        // Load the wintun DLL from one of several possible locations.
        let wintun = load_wintun(resource_dir)?;

        // Try to open existing adapter, or create a new one
        let adapter = match wintun::Adapter::open(&wintun, name) {
            Ok(a) => a,
            Err(_) => wintun::Adapter::create(&wintun, name, "Aether", None)
                .map_err(|e| format!("failed to create wintun adapter: {e}"))?,
        };

        // Set the IP address on the adapter
        let ip_addr: Ipv4Addr = ip.parse().map_err(|e| format!("invalid IP: {e}"))?;
        adapter
            .set_address(ip_addr)
            .map_err(|e| format!("failed to set adapter address: {e}"))?;

        // Set MTU
        let _ = adapter.set_mtu(1500);

        // Start a session
        let session = Arc::new(
            adapter
                .start_session(wintun::MAX_RING_CAPACITY)
                .map_err(|e| format!("failed to start wintun session: {e}"))?,
        );

        Ok(Self {
            wintun,
            adapter,
            session,
        })
    }

    /// Read a packet from the TUN adapter (blocking).
    pub fn receive_packet(&self) -> Result<Vec<u8>, String> {
        let packet = self
            .session
            .receive_blocking()
            .map_err(|e| format!("receive failed: {e}"))?;
        Ok(packet.bytes().to_vec())
    }

    /// Write a packet to the TUN adapter.
    pub fn send_packet(&self, data: &[u8]) -> Result<(), String> {
        let mut packet = self
            .session
            .allocate_send_packet(data.len() as u16)
            .map_err(|e| format!("allocate send packet failed: {e}"))?;
        packet.bytes_mut().copy_from_slice(data);
        self.session.send_packet(packet);
        Ok(())
    }

    /// Get the adapter's interface index (for route management).
    pub fn interface_index(&self) -> u32 {
        self.adapter.get_adapter_index().unwrap_or(0)
    }

    /// Get the adapter name.
    pub fn name(&self) -> String {
        self.adapter.get_name().unwrap_or_default()
    }

    /// Shutdown the session (unblocks any blocking readers).
    pub fn shutdown(&self) {
        let _ = self.session.shutdown();
    }
}

impl Drop for TunAdapter {
    fn drop(&mut self) {
        // Shutdown unblocks any readers, then session drops and closes
        self.shutdown();
    }
}

/// Try to load wintun.dll from several locations:
/// 1. Tauri resource directory (bundled with app)
/// 2. Next to the current executable
/// 3. In a `binaries` subdirectory next to the executable
/// 4. In the current working directory (fallback)
fn load_wintun(resource_dir: Option<&std::path::Path>) -> Result<wintun::Wintun, String> {
    // Try Tauri resource directory first
    if let Some(dir) = resource_dir {
        let path = dir.join("binaries").join("wintun.dll");
        if path.exists() {
            return unsafe { wintun::load_from_path(&path) }
                .map_err(|e| format!("load_from_path {:?}: {e}", path));
        }
        // Also try directly in resource dir
        let path = dir.join("wintun.dll");
        if path.exists() {
            return unsafe { wintun::load_from_path(&path) }
                .map_err(|e| format!("load_from_path {:?}: {e}", path));
        }
    }

    // Try next to the executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let path = exe_dir.join("wintun.dll");
            if path.exists() {
                return unsafe { wintun::load_from_path(&path) }
                    .map_err(|e| format!("load_from_path {:?}: {e}", path));
            }
            let path = exe_dir.join("binaries").join("wintun.dll");
            if path.exists() {
                return unsafe { wintun::load_from_path(&path) }
                    .map_err(|e| format!("load_from_path {:?}: {e}", path));
            }
        }
    }

    // Fallback: try current directory
    unsafe { wintun::load() }
        .map_err(|e| format!("failed to load wintun.dll from any location: {e}"))
}

/// Parse a CIDR string like "10.0.0.2/24" into (ip, prefix_len).
fn parse_cidr(cidr: &str) -> Result<(String, u32), String> {
    let parts: Vec<&str> = cidr.split('/').collect();
    if parts.len() != 2 {
        return Err(format!("invalid CIDR format: {cidr}"));
    }
    let ip = parts[0]
        .parse::<Ipv4Addr>()
        .map_err(|e| format!("invalid IP address: {e}"))?;
    let prefix_len: u32 = parts[1]
        .parse()
        .map_err(|e| format!("invalid prefix length: {e}"))?;
    if prefix_len > 32 {
        return Err(format!("prefix length must be <= 32, got {prefix_len}"));
    }
    Ok((ip.to_string(), prefix_len))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_cidr_valid() {
        let (ip, prefix) = parse_cidr("10.0.0.2/24").unwrap();
        assert_eq!(ip, "10.0.0.2");
        assert_eq!(prefix, 24);
    }

    #[test]
    fn parse_cidr_invalid_format() {
        assert!(parse_cidr("10.0.0.2").is_err());
        assert!(parse_cidr("10.0.0.2/").is_err());
        assert!(parse_cidr("/24").is_err());
    }

    #[test]
    fn parse_cidr_invalid_ip() {
        assert!(parse_cidr("999.999.999.999/24").is_err());
    }

    #[test]
    fn parse_cidr_prefix_too_large() {
        assert!(parse_cidr("10.0.0.2/33").is_err());
    }
}

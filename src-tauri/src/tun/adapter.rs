use std::net::Ipv4Addr;
use std::sync::Arc;

pub struct TunAdapter {
    _wintun: wintun::Wintun,
    adapter: Arc<wintun::Adapter>,
    session: Arc<wintun::Session>,
}

impl TunAdapter {
    pub fn create(
        name: &str,
        address: &str,
        resource_dir: Option<&std::path::Path>,
    ) -> Result<Self, String> {
        let (ip, _prefix_len) = parse_cidr(address)?;

        let wintun = load_wintun(resource_dir)?;

        let adapter = match wintun::Adapter::open(&wintun, name) {
            Ok(a) => a,
            Err(_) => wintun::Adapter::create(&wintun, name, "Aether", None)
                .map_err(|e| format!("failed to create wintun adapter: {e}"))?,
        };

        let ip_addr: Ipv4Addr = ip.parse().map_err(|e| format!("invalid IP: {e}"))?;
        adapter
            .set_address(ip_addr)
            .map_err(|e| format!("failed to set adapter address: {e}"))?;

        let _ = adapter.set_mtu(1500);

        let session = Arc::new(
            adapter
                .start_session(wintun::MAX_RING_CAPACITY)
                .map_err(|e| format!("failed to start wintun session: {e}"))?,
        );

        Ok(Self {
            _wintun: wintun,
            adapter,
            session,
        })
    }

    pub fn receive_packet(&self) -> Result<Vec<u8>, String> {
        let packet = self
            .session
            .receive_blocking()
            .map_err(|e| format!("receive failed: {e}"))?;
        Ok(packet.bytes().to_vec())
    }

    pub fn send_packet(&self, data: &[u8]) -> Result<(), String> {
        let mut packet = self
            .session
            .allocate_send_packet(data.len() as u16)
            .map_err(|e| format!("allocate send packet failed: {e}"))?;
        packet.bytes_mut().copy_from_slice(data);
        self.session.send_packet(packet);
        Ok(())
    }

    pub fn interface_index(&self) -> u32 {
        self.adapter.get_adapter_index().unwrap_or(0)
    }

    pub fn name(&self) -> String {
        self.adapter.get_name().unwrap_or_default()
    }

    pub fn shutdown(&self) {
        let _ = self.session.shutdown();
    }
}

impl Drop for TunAdapter {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn load_wintun(resource_dir: Option<&std::path::Path>) -> Result<wintun::Wintun, String> {
    if let Some(dir) = resource_dir {
        let path = dir.join("binaries").join("wintun.dll");
        if path.exists() {
            return unsafe { wintun::load_from_path(&path) }
                .map_err(|e| format!("load_from_path {:?}: {e}", path));
        }
        let path = dir.join("wintun.dll");
        if path.exists() {
            return unsafe { wintun::load_from_path(&path) }
                .map_err(|e| format!("load_from_path {:?}: {e}", path));
        }
    }

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

    unsafe { wintun::load() }
        .map_err(|e| format!("failed to load wintun.dll from any location: {e}"))
}

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

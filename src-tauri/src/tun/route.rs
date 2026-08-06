use super::adapter::TunAdapter;
use std::net::Ipv4Addr;

/// Manages the Windows routing table when TUN mode is active.
pub struct RouteManager {
    original_default_gateway: Option<Ipv4Addr>,
    original_interface_index: Option<u32>,
    tun_interface_index: u32,
    routes_changed: bool,
}

impl RouteManager {
    pub fn save_current_state() -> Result<Self, String> {
        let (gateway, iface_idx) = get_default_gateway()?;
        Ok(Self {
            original_default_gateway: gateway,
            original_interface_index: iface_idx,
            tun_interface_index: 0,
            routes_changed: false,
        })
    }

    pub fn redirect_default_through_tun(&mut self, tun_adapter: &TunAdapter) -> Result<(), String> {
        self.tun_interface_index = tun_adapter.interface_index();
        self.routes_changed = true;

        let tun_ip = get_tun_gateway(tun_adapter)?;

        if let Some(gw) = self.original_default_gateway {
            let gw_str = gw.to_string();

            // Add bypass routes for private ranges through the original gateway
            // (so local network traffic doesn't go through TUN)
            for prefix in &["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"] {
                let parts: Vec<&str> = prefix.split('/').collect();
                let _ = run_cmd(&[
                    "route",
                    "add",
                    parts[0],
                    "mask",
                    if parts[1] == "8" {
                        "255.0.0.0"
                    } else if parts[1] == "12" {
                        "255.240.0.0"
                    } else {
                        "255.255.0.0"
                    },
                    &gw_str,
                    "metric",
                    "5",
                ]);
            }

            // Add bypass route for loopback
            let _ = run_cmd(&[
                "route",
                "add",
                "127.0.0.0",
                "mask",
                "255.0.0.0",
                "127.0.0.1",
                "metric",
                "5",
            ]);

            // Add bypass for the original gateway itself
            let _ = run_cmd(&["route", "add", &gw_str, &gw_str, "metric", "5"]);

            // Add bypass routes for Cloudflare WARP/edge IPs (Aether connects here)
            // These are the known Cloudflare anycast ranges
            for cf_prefix in &[
                "162.159.192.0/20",
                "162.159.198.0/24",
                "172.64.0.0/13",
                "104.16.0.0/13",
            ] {
                let parts: Vec<&str> = cf_prefix.split('/').collect();
                let mask = match parts[1] {
                    "13" => "255.248.0.0",
                    "20" => "255.255.240.0",
                    "24" => "255.255.255.0",
                    _ => "255.255.255.0",
                };
                let _ = run_cmd(&[
                    "route", "add", parts[0], "mask", mask, &gw_str, "metric", "5",
                ]);
            }
        }

        // Now change the default route to go through TUN
        run_cmd(&[
            "route", "change", "0.0.0.0", "mask", "0.0.0.0", &tun_ip, "metric", "1",
        ])?;

        log::info!("[tun] Default route redirected through TUN adapter");
        Ok(())
    }

    pub fn restore(&mut self) -> Result<(), String> {
        if !self.routes_changed {
            return Ok(());
        }

        if let Some(gw) = self.original_default_gateway {
            let gw_str = gw.to_string();
            let mut args = vec![
                "route", "change", "0.0.0.0", "mask", "0.0.0.0", &gw_str, "metric", "1",
            ];

            if let Some(iface) = self.original_interface_index {
                let iface_str = iface.to_string();
                args.push("if");
                args.push(&iface_str);
                run_cmd(&args)?;
            } else {
                run_cmd(&args)?;
            }
        }

        // Flush DNS cache
        let _ = run_cmd(&["ipconfig", "/flushdns"]);

        Ok(())
    }
}

impl Drop for RouteManager {
    fn drop(&mut self) {
        let _ = self.restore();
    }
}

fn get_default_gateway() -> Result<(Option<Ipv4Addr>, Option<u32>), String> {
    let output = run_cmd(&["route", "print", "0.0.0.0"])?;
    let mut gateway = None;
    let mut iface_idx = None;

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("0.0.0.0") && !trimmed.contains("On-link") {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if parts.len() >= 3 {
                if let Ok(gw_ip) = parts[2].parse::<Ipv4Addr>() {
                    if !gw_ip.is_unspecified() {
                        gateway = Some(gw_ip);
                    }
                }
            }
            if let Some(last) = parts.last() {
                if let Ok(idx) = last.parse::<u32>() {
                    iface_idx = Some(idx);
                }
            }
            break;
        }
    }

    Ok((gateway, iface_idx))
}

fn get_tun_gateway(tun_adapter: &TunAdapter) -> Result<String, String> {
    // The TUN adapter's IP was configured during creation
    // Read it from the adapter's network configuration
    let name = tun_adapter.name();
    let output = std::process::Command::new("netsh")
        .args(["interface", "ip", "show", "addresses", &name])
        .output()
        .map_err(|e| format!("netsh failed: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let trimmed = line.trim();
        if let Some(ip_str) = trimmed.strip_prefix("IP Address:") {
            let ip = ip_str.trim();
            if ip.parse::<Ipv4Addr>().is_ok() {
                return Ok(ip.to_string());
            }
        }
    }

    Ok("10.0.0.2".to_string())
}

fn run_cmd(args: &[&str]) -> Result<String, String> {
    if args.is_empty() {
        return Err("empty command".into());
    }

    let output = std::process::Command::new(args[0])
        .args(&args[1..])
        .output()
        .map_err(|e| format!("command '{}' failed: {e}", args[0]))?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

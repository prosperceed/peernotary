use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use url::Url;

use crate::error::ApiError;

pub fn validate_target_domain(
    target_host: &str,
    allowed_hostnames: &[String],
) -> Result<String, ApiError> {
    let normalized = target_host.trim().to_ascii_lowercase();
    if normalized.is_empty() || normalized.len() > 253 {
        return Err(ApiError::BadRequest(
            "Invalid target hostname length".into(),
        ));
    }

    if normalized.contains('/')
        || normalized.contains(':')
        || normalized.contains('@')
        || normalized.contains('?')
        || normalized.contains('#')
        || normalized.contains('\\')
    {
        return Err(ApiError::Forbidden("FORBIDDEN_HOSTNAME_SYNTAX"));
    }

    // Reject IP literals directly
    if normalized.parse::<IpAddr>().is_ok() {
        return Err(ApiError::Forbidden("IP_LITERAL_FORBIDDEN"));
    }

    if is_internal_or_reserved_hostname(&normalized) {
        return Err(ApiError::Forbidden("SSRF_RESERVED_HOSTNAME"));
    }

    if !allowed_hostnames
        .iter()
        .any(|allowed| allowed == &normalized)
    {
        return Err(ApiError::VerificationFailed {
            code: "UNEXPECTED_HOST",
            reason: format!("Server hostname '{normalized}' is not in the authorized allowlist"),
        });
    }

    Ok(normalized)
}

pub fn validate_https_target_url(
    raw_url: &str,
    allowed_hostnames: &[String],
) -> Result<(Url, String), ApiError> {
    let parsed =
        Url::parse(raw_url).map_err(|_| ApiError::BadRequest("Malformed target URL".into()))?;

    if parsed.scheme() != "https" {
        return Err(ApiError::Forbidden("NON_HTTPS_TARGET_FORBIDDEN"));
    }

    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(ApiError::Forbidden("URL_CREDENTIALS_FORBIDDEN"));
    }

    if let Some(port) = parsed.port() {
        if port != 443 {
            return Err(ApiError::Forbidden("NON_STANDARD_PORT_FORBIDDEN"));
        }
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| ApiError::BadRequest("Target URL missing host".into()))?;

    let validated_host = validate_target_domain(host, allowed_hostnames)?;
    Ok((parsed, validated_host))
}

pub fn is_internal_or_reserved_hostname(host: &str) -> bool {
    let h = host.trim().to_ascii_lowercase();
    h == "localhost"
        || h.ends_with(".localhost")
        || h.ends_with(".local")
        || h.ends_with(".internal")
        || h.ends_with(".arpa")
        || h.ends_with(".home.arpa")
        || h.ends_with(".corp")
        || h.ends_with(".lan")
        || h == "metadata.google.internal"
        || h == "169.254.169.254"
        || h == "instance-data"
}

pub fn is_forbidden_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_forbidden_ipv4(v4),
        IpAddr::V6(v6) => is_forbidden_ipv6(v6),
    }
}

pub fn is_forbidden_ipv4(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_documentation()
        || ip.is_unspecified()
        || ip.is_multicast()
        // Carrier-grade NAT 100.64.0.0/10
        || (octets[0] == 100 && (octets[1] & 0b1100_0000) == 0b0100_0000)
        // Cloud metadata 169.254.169.254
        || (octets[0] == 169 && octets[1] == 254)
        // IETF protocol assignments 192.0.0.0/24
        || (octets[0] == 192 && octets[1] == 0 && octets[2] == 0)
        // Benchmark testing 198.18.0.0/15
        || (octets[0] == 198 && (octets[1] == 18 || octets[1] == 19))
        // Reserved future use 240.0.0.0/4
        || (octets[0] & 0b1111_0000) == 240
}

pub fn is_forbidden_ipv6(ip: Ipv6Addr) -> bool {
    if ip.is_loopback() || ip.is_unspecified() || ip.is_multicast() {
        return true;
    }
    let segments = ip.segments();
    // Unique local fc00::/7
    if (segments[0] & 0xfe00) == 0xfc00 {
        return true;
    }
    // Link-local fe80::/10
    if (segments[0] & 0xffc0) == 0xfe80 {
        return true;
    }
    // Documentation 2001:db8::/32
    if segments[0] == 0x2001 && segments[1] == 0x0db8 {
        return true;
    }
    // IPv4-mapped or IPv4-compatible IPv6 addresses
    if let Some(v4) = ip.to_ipv4() {
        return is_forbidden_ipv4(v4);
    }
    false
}

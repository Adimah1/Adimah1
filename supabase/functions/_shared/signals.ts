// Server-side location signals the app can't fake: the request's IP address,
// checked against an IP-intelligence service for VPN/proxy/Tor use and a
// rough location. Uses IPQualityScore (IPQS_API_KEY); without a key the IP
// check is skipped and only device signals are used.

export interface DeviceSignals {
  accuracy?: number | null;
  mocked?: boolean | null;
  /** Result of Play Integrity / App Attest, when the app performs it. */
  attestation?: 'passed' | 'failed' | 'unavailable';
}

export interface LocationSignals {
  accuracy_m?: number;
  mocked?: boolean;
  attestation?: string;
  vpn?: boolean;
  ip_lat?: number;
  ip_lng?: number;
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip');
}

interface IpqsResult {
  success: boolean;
  vpn?: boolean;
  active_vpn?: boolean;
  proxy?: boolean;
  tor?: boolean;
  latitude?: number;
  longitude?: number;
}

export async function collectSignals(req: Request, device: DeviceSignals): Promise<LocationSignals> {
  const signals: LocationSignals = {
    accuracy_m: typeof device.accuracy === 'number' ? device.accuracy : undefined,
    mocked: device.mocked === true,
    attestation: device.attestation ?? 'unavailable',
  };

  const key = Deno.env.get('IPQS_API_KEY');
  const ip = clientIp(req);
  if (!key || !ip) return signals;

  try {
    const res = await fetch(
      `https://ipqualityscore.com/api/json/ip/${encodeURIComponent(key)}/${encodeURIComponent(ip)}?strictness=1&allow_public_access_points=true`,
    );
    const data = (await res.json()) as IpqsResult;
    if (data.success) {
      signals.vpn = !!(data.vpn || data.active_vpn || data.proxy || data.tor);
      if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
        signals.ip_lat = data.latitude;
        signals.ip_lng = data.longitude;
      }
    }
  } catch (err) {
    // Fail open on the IP check only: device signals and velocity still apply.
    console.error('IP check failed', err);
  }
  return signals;
}

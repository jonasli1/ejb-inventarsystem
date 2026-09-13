import Foundation

/// WebAuthn (and this backend's `@simplewebauthn/server`) encodes every binary field as
/// base64url — standard base64 with `-`/`_` instead of `+`/`/` and no padding.
nonisolated extension Data {
    init?(base64URLEncoded string: String) {
        var base64 = string.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        let remainder = base64.count % 4
        if remainder > 0 {
            base64.append(String(repeating: "=", count: 4 - remainder))
        }
        self.init(base64Encoded: base64)
    }

    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

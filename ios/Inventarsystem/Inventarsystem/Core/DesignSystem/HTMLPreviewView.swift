import SwiftUI
import WebKit

/// Read-only live preview of an HTML fragment (notification-template bodies, the E-Mail footer)
/// — mirrors the frontend's `RichTextEditor` preview without needing a full WYSIWYG toolbar,
/// per the plan's simplified editor decision for this rarely-used admin screen.
struct HTMLPreviewView: UIViewRepresentable {
    var html: String

    func makeUIView(context: Context) -> WKWebView {
        let view = WKWebView()
        view.isOpaque = false
        view.backgroundColor = .clear
        view.scrollView.backgroundColor = .clear
        return view
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        webView.loadHTMLString(Self.wrap(html), baseURL: nil)
    }

    private static func wrap(_ fragment: String) -> String {
        """
        <html>
        <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
        body { font: -apple-system-body; font-size: 16px; color: #1a1a1a; margin: 12px; }
        @media (prefers-color-scheme: dark) { body { color: #f2f2f2; } }
        </style>
        </head>
        <body>\(fragment)</body>
        </html>
        """
    }
}

#Preview {
    HTMLPreviewView(html: "<p>Hallo <strong>{{userName}}</strong>,</p><p>dies ist eine Vorschau.</p>")
        .frame(height: 200)
}

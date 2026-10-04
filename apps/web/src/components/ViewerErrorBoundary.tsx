import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ViewerErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Viewer crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            height: "100%",
            minHeight: 240,
            padding: 24,
            color: "var(--text-primary)",
            textAlign: "center",
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16 }}>An error occurred while displaying the document</h3>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
            Please try again. If the problem persists, reload the application.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              style={{
                cursor: "pointer",
                padding: "6px 16px",
                fontSize: 13,
                borderRadius: 4,
                border: "1px solid var(--border-color)",
                background: "transparent",
                color: "var(--text-primary)",
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                cursor: "pointer",
                padding: "6px 16px",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 4,
                border: "none",
                background: "var(--acrobat-blue)",
                color: "#fff",
              }}
            >
              Reload application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

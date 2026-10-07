import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  buildSha: string;
};

type State = {
  error: Error | null;
  componentStack: string;
  copied: boolean;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    error: null,
    componentStack: "",
    copied: false,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("OPDF renderer crashed", {
      name: error.name,
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
      buildSha: this.props.buildSha,
    });
    this.setState({ componentStack: info.componentStack ?? "" });
  }

  private errorDetails() {
    const { error, componentStack } = this.state;
    return [
      "OPDF web error",
      `Build: ${this.props.buildSha}`,
      `URL: ${window.location.href}`,
      `Time: ${new Date().toISOString()}`,
      error ? `${error.name}: ${error.message}` : "Unknown error",
      error?.stack || "",
      componentStack,
    ].filter(Boolean).join("\n");
  }

  private copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(this.errorDetails());
      this.setState({ copied: true });
      window.setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      this.setState({ copied: false });
    }
  };

  private goHome = () => {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    window.location.assign(url.href);
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--ui-bg)] p-6 text-[var(--text-primary)]">
        <section
          role="alert"
          data-opdf-error-boundary="true"
          className="w-full max-w-xl rounded-xl border border-[var(--ui-border)] bg-[var(--panel-bg)] p-6 shadow-xl"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-error-text)]">
            OPDF recovered from an interface error
          </p>
          <h1 className="mt-2 text-xl font-semibold">The document data on the server is unchanged.</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Reload the workspace to continue. If the problem happens again, copy the diagnostic details before reloading.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
            >
              Reload OPDF
            </button>
            <button
              type="button"
              onClick={this.goHome}
              className="rounded-md border border-[var(--ui-border)] px-4 py-2 text-sm font-medium"
            >
              Go to Home
            </button>
            <button
              type="button"
              onClick={() => void this.copyDetails()}
              className="rounded-md border border-[var(--ui-border)] px-4 py-2 text-sm font-medium"
            >
              {this.state.copied ? "Copied" : "Copy error details"}
            </button>
          </div>
          <details className="mt-5 text-xs text-[var(--text-secondary)]">
            <summary className="cursor-pointer select-none">Technical details</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[var(--ui-muted-bg)] p-3">
              {this.errorDetails()}
            </pre>
          </details>
        </section>
      </main>
    );
  }
}

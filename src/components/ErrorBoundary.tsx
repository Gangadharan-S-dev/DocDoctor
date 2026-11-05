import { Component, type ReactNode } from 'react'

interface State { failed: boolean }

/** Stops a crashed page (e.g. a failed lazy chunk) from white-screening the app. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State { return { failed: true } }

  render() {
    if (this.state.failed) {
      return (
        <div className="mx-auto max-w-xl px-4 py-24 text-center">
          <h1 className="font-display text-2xl font-extrabold text-ink-950">Something went wrong</h1>
          <p className="mt-2 text-slate-600">This page failed to load. Your files were only ever in this browser tab — nothing was uploaded or lost anywhere else.</p>
          <button type="button" className="btn-accent mt-6" onClick={() => window.location.reload()}>Reload page</button>
        </div>
      )
    }
    return this.props.children
  }
}

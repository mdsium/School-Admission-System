import { Component, ReactNode } from "react";

/** Last line of defence: the UI must never show a blank page. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="card center">
          <h2>কিছু একটা ভুল হয়েছে</h2>
          <p>পেজটি আবার লোড করুন।</p>
          <button onClick={() => location.reload()}>Reload</button>
        </div>
      );
    return this.props.children;
  }
}

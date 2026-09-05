"use client";

import { Component, type ReactNode } from "react";

export default class SectionBoundary extends Component<{
  children: ReactNode; label: string;
}, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="glass-container jg-section-error" role="status">
      <h3>{this.props.label} is temporarily unavailable</h3>
      <p>The rest of the site is still available.</p>
      <button className="jg-button jg-button-secondary" onClick={() => this.setState({ failed: false })}>Try again</button>
    </div>;
  }
}

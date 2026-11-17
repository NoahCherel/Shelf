import { Component, useEffect, type ReactNode } from "react";
import { syncLayout } from "../../core/layout";
import { syncShell } from "../../core/shell";
import { DockBar } from "./Bar";
import { useOpenRequests } from "./useOpenRequests";

/** How long a broken dock waits before drawing itself again. */
const RETRY_MS = 1000;

/** The taskbar is hidden, so a dock that breaks mustn't leave nothing on screen: it starts over. */
export class Recovering extends Component<{ children: ReactNode }, { broken: boolean; round: number }> {
  state = { broken: false, round: 0 };
  private timer: ReturnType<typeof setTimeout> | undefined;

  static getDerivedStateFromError() {
    return { broken: true };
  }

  componentDidCatch() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.setState((s) => ({ broken: false, round: s.round + 1 })), RETRY_MS);
  }

  componentWillUnmount() {
    clearTimeout(this.timer);
  }

  render() {
    return this.state.broken ? null : <div key={this.state.round} style={{ display: "contents" }}>{this.props.children}</div>;
  }
}

export function DockWindow() {
  useEffect(() => {
    syncLayout();
    syncShell();
  }, []);
  useOpenRequests();
  return (
    <Recovering>
      <DockBar />
    </Recovering>
  );
}

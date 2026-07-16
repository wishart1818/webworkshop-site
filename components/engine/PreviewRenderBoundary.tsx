"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type PreviewRenderBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
  resetKey: string;
};

type PreviewRenderBoundaryState = {
  failed: boolean;
};

export class PreviewRenderBoundary extends Component<PreviewRenderBoundaryProps, PreviewRenderBoundaryState> {
  state: PreviewRenderBoundaryState = { failed: false };

  static getDerivedStateFromError(): PreviewRenderBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Preview renderer failed safely during development.", error, info.componentStack);
    }
  }

  componentDidUpdate(previousProps: PreviewRenderBoundaryProps) {
    if (this.state.failed && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

import React from "react";

type EmptyStateProps = {
  title: string;
  body: string;
  action?: () => void;
  actionLabel?: string;
};

export function EmptyState({ title, body, action, actionLabel = "Clear filters" }: EmptyStateProps) {
  return (
    <div className="engine-empty">
      <span aria-hidden="true">+</span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action && (
        <button className="engine-button engine-button--primary" onClick={action} type="button">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function LoadingState({ title, body }: Pick<EmptyStateProps, "title" | "body">) {
  return (
    <div className="engine-loading-state" role="status">
      <i aria-hidden="true" />
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </div>
  );
}

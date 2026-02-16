export function Panel({ title, subtitle, children, actions }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function InlineError({ message }) {
  if (!message) {
    return null;
  }
  return <p className="error-text">{message}</p>;
}

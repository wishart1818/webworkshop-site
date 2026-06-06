type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
};

export function SectionHeader({ eyebrow, title, description }: SectionHeaderProps) {
  return (
    <div className="section-head">
      {eyebrow ? (
        <p className="section-head__label">{eyebrow}</p>
      ) : null}
      <h2 className="section-head__title display-type">{title}</h2>
      {description ? (
        <p className="section-head__copy">{description}</p>
      ) : null}
    </div>
  );
}

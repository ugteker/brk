import type { UnifiedCharacterReportDto } from '../api/agents';
import { isHttpUrl } from '../utils/links';

interface CharacterReportRendererProps {
  report: UnifiedCharacterReportDto;
}

function renderStringList(items: string[]) {
  if (items.length === 0) return <p className="text-sm text-gray-500">—</p>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((item) => (
        <li key={item}>
          {isHttpUrl(item) ? (
            <a href={item} target="_blank" rel="noreferrer">
              {item}
            </a>
          ) : (
            item
          )}
        </li>
      ))}
    </ul>
  );
}

function CharacterSection({ report }: CharacterReportRendererProps) {
  const section = report.section;
  if (section.character_type === 'finance_expert') {
    return (
      <div className="space-y-2">
        <h6 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Market summary</h6>
        <p className="text-sm">{section.market_summary || '—'}</p>
        <h6 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Signals</h6>
        {section.signals.length === 0 ? (
          <p className="text-sm text-gray-500">—</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {section.signals.map((signal) => (
              <li key={`${signal.symbol}-${signal.side}`}>
                {signal.symbol} · {signal.side === 'long' ? 'Long' : 'Short'} · {signal.confidence}%
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  if (section.character_type === 'teacher') {
    return (
      <div className="space-y-2">
        <h6 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Lesson explanation</h6>
        <p className="text-sm">{section.lesson_explanation || '—'}</p>
      </div>
    );
  }
  if (section.character_type === 'trainer') {
    return (
      <div className="space-y-2">
        <h6 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Q&amp;A drill</h6>
        {section.qa_drill.length === 0 ? (
          <p className="text-sm text-gray-500">—</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {section.qa_drill.map((qa, index) => (
              <li key={`${qa.question}-${index}`}>
                <span className="font-medium">{qa.question}</span>
                <p>{qa.answer}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  if (section.character_type === 'philosopher') {
    return (
      <div className="space-y-2">
        <h6 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Argument &amp; reflection</h6>
        <p className="text-sm">{section.argument_reflection || '—'}</p>
      </div>
    );
  }
  if (section.character_type === 'influencer') {
    return (
      <div className="space-y-2">
        <h6 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Content angles</h6>
        {renderStringList(section.content_angles)}
        <h6 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Hooks</h6>
        {renderStringList(section.hooks)}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <h6 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Bullet digest</h6>
      {renderStringList(section.bullet_digest)}
    </div>
  );
}

export function CharacterReportRenderer({ report }: CharacterReportRendererProps) {
  return (
    <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <h6 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Summary</h6>
          <p className="text-sm">{report.common.summary || '—'}</p>
          <h6 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Key takeaways</h6>
          {renderStringList(report.common.key_takeaways)}
        </div>
        <div className="space-y-2">
          <h6 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Sources used</h6>
          {renderStringList(report.common.sources_used)}
          <h6 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Citations</h6>
          {renderStringList(report.common.citations)}
        </div>
      </div>
      <div className="mt-3 border-t border-gray-200 pt-3">
        <CharacterSection report={report} />
      </div>
    </div>
  );
}

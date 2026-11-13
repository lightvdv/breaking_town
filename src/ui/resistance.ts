import { tr } from '../i18n';
import { buildingDefOf, groupOf } from '../sim/lookup';
import { defenderOf, personOf } from '../sim/resistance';
import type { BuildingType, Content, DefenderState, ResistanceReport } from '../sim/types';

/** Texts of the town's resistance and its defenders (CONCEPT.md §5.7). */

export function personName(c: Content, id: string): string {
  return personOf(c, id)?.name ?? id;
}

/** «Копать под Рустама», «компромат на Ирину Сергеевну». */
export function personAcc(c: Content, id: string): string {
  return personOf(c, id)?.nameAcc ?? personName(c, id);
}

/** What a standing defender does to the paper now, in numbers. */
export function defenderEffectLine(c: Content, d: DefenderState): string {
  const e = defenderOf(c, d.id).effect;
  const k = d.level * c.balance.defenderPowerMul;
  const pct = (v: number) => Math.round(Math.abs(v) * k * 100);
  const out: string[] = [];
  if (e.checkerMul) out.push(tr('фактчекеры проверяют чаще: +{0}%', pct(e.checkerMul)));
  if (e.scaryImpactMul) out.push(tr('страшные новости слабее: −{0}%', pct(e.scaryImpactMul)));
  if (e.wordOfMouthMul) out.push(tr('сарафанное радио слабее: −{0}%', pct(e.wordOfMouthMul)));
  if (e.lateExposureMul) out.push(tr('старая ложь всплывает чаще: +{0}%', pct(e.lateExposureMul)));
  if (e.crimeCoolMul) out.push(tr('криминальный жар остывает быстрее: +{0}%', pct(e.crimeCoolMul)));
  for (const [g, v] of Object.entries(e.groupChurn ?? {})) out.push(tr('читатели-{0} уходят: +{1}% в день', groupOf(c, g).name.toLowerCase(), pct(v ?? 0)));
  for (const [t, v] of Object.entries(e.stainTypeMul ?? {})) out.push(tr('травля «{0}» слабее: −{1}%', buildingDefOf(c, t as BuildingType).name.toLowerCase(), pct(v ?? 0)));
  return out.join(' · ');
}

/** The day's resistance news for the summary and the plaque: who stood up, who gave up, the rally. */
export function resistanceLines(c: Content, r: ResistanceReport | undefined): { text: string; good: boolean }[] {
  if (!r) return [];
  const she = (id: string) => !!personOf(c, id)?.female;
  const lines: { text: string; good: boolean }[] = [];
  if (r.rallied) lines.push({ text: tr('Город сплотился против газеты: ссоры затихли, люди приободрились, защитники окрепли'), good: false });
  if (r.rose) {
    const d = defenderOf(c, r.rose);
    lines.push({ text: she(r.rose) ? tr('{0} встала против газеты: {1}', personName(c, r.rose), d.title) : tr('{0} встал против газеты: {1}', personName(c, r.rose), d.title), good: false });
  }
  for (const id of r.stronger) lines.push({ text: tr('Компромату на {0} не поверили — защитник окреп', personAcc(c, id)), good: false });
  for (const b of r.beaten) {
    const name = personName(c, b.id);
    const text =
      b.why === 'discredited'
        ? she(b.id)
          ? tr('{0} опозорена и замолчала', name)
          : tr('{0} опозорен и замолчал', name)
        : b.why === 'closed'
          ? she(b.id)
            ? tr('{0} осталась без работы и сдалась', name)
            : tr('{0} остался без работы и сдался', name)
          : she(b.id)
            ? tr('{0} уехала из города', name)
            : tr('{0} уехал из города', name);
    lines.push({ text, good: true });
  }
  if (r.calmed.length) lines.push({ text: tr('Город успокоился: защитники разошлись по домам'), good: true });
  return lines;
}

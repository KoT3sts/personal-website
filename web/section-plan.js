// Shared by entrance.js and motion.js. Kept tiny so motion.js can import it
// without pulling in the whole build tour.
// Manual-scroll passes (after a cancelled tour) only trace content: nothing
// is hidden. Targets stay within elements that motion.js keeps still while
// such passes are possible (see SECTION_TARGETS).
export const SECTION_PLAN = [
  { sel: 'h2:not(.cinematic-copy h2)', role: 'type', kind: 'caret', act: 'checking heading' },
  { sel: '.about-title-panel, .cinematic-art, .project-card:not([aria-hidden="true"]) .project-image-link', role: 'art', kind: 'frame', cross: true, act: 'framing artwork' },
  { sel: '.cinematic-copy, .approach-heading > p', role: 'copy', kind: 'review', act: 'reviewing copy' },
  { sel: '.section-top, .about-transition-meta, .cinematic-topline', role: 'layout', kind: 'frame', act: 'framing layout' },
  { sel: '.scene-actions, .contact-button', role: 'links', kind: 'review', size: true, act: 'checking links' },
  { sel: '.approach-list details, .capability-list, .role, .skill-list', role: 'qa', kind: 'review', multi: 2, act: 'checking spacing' },
];
// Everything a manual pass may frame; motion.js keeps these still meanwhile.
export const SECTION_TARGETS = SECTION_PLAN.map(spec => spec.sel).join(', ');

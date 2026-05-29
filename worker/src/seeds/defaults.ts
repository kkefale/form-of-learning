// worker/src/seeds/defaults.ts
// Default seed ontologies bundled with the Worker.
// These are inserted into D1 on first deploy via POST /seeds/init.

export interface SeedData {
  name:        string;
  description: string;
  nodes: Array<{
    id:    string;
    label: string;
    state: string;
    props: { definition: string };
  }>;
  edges: Array<{
    src:    string;
    dst:    string;
    rel:    string;
    weight: number;
  }>;
}

export const LAWS_OF_FORM: SeedData = {
  name: 'laws_of_form',
  description: "Spencer-Brown's Laws of Form: the primordial calculus of distinctions. Foundation of second-order cybernetics and Pask's Conversation Theory.",
  nodes: [
    { id: 'Distinction',               label: 'Distinction',                 state: 'MASTER', props: { definition: 'The primordial act — drawing a line in the void' } },
    { id: 'MarkedSpace',               label: 'Marked Space',                state: 'MASTER', props: { definition: 'The inside of a boundary — the concept itself' } },
    { id: 'UnmarkedSpace',             label: 'Unmarked Space',              state: 'MASTER', props: { definition: 'Everything excluded by the distinction' } },
    { id: 'Boundary',                  label: 'Boundary',                    state: 'MASTER', props: { definition: 'The line that severs marked from unmarked' } },
    { id: 'ReEntry',                   label: 'Re-Entry',                    state: 'MASTER', props: { definition: 'When a distinction is fed back into the space it distinguishes' } },
    { id: 'Oscillation',               label: 'Oscillation',                 state: 'MASTER', props: { definition: 'Systemic paradox caused by re-entry' } },
    { id: 'TheCrossing',               label: 'The Crossing',                state: 'MASTER', props: { definition: 'The dynamic act of traversing a boundary without losing the Form' } },
    { id: 'Mastery',                   label: 'Mastery',                     state: 'MASTER', props: { definition: 'Cognitive agility to cross and re-cross a boundary on demand' } },
    { id: 'Observer',                  label: 'Observer',                    state: 'MASTER', props: { definition: 'The entity performing a distinction' } },
    { id: 'BlindSpot',                 label: 'Blind Spot',                  state: 'MASTER', props: { definition: 'What the observer cannot see by virtue of how they observe' } },
    { id: 'FirstOrderObservation',     label: 'First-Order Observation',     state: 'MASTER', props: { definition: 'Looking at the world directly — observing the subject' } },
    { id: 'SecondOrderObservation',    label: 'Second-Order Observation',    state: 'MASTER', props: { definition: 'Observing the observer — watching how someone observes' } },
    { id: 'Autopoiesis',               label: 'Autopoiesis',                 state: 'MASTER', props: { definition: 'Self-creating, self-maintaining cognitive or biological organization' } },
    { id: 'OperationalClosure',        label: 'Operational Closure',         state: 'MASTER', props: { definition: 'A system whose operations refer only to its own operations' } },
    { id: 'StructuralCoupling',        label: 'Structural Coupling',         state: 'MASTER', props: { definition: 'How two closed systems perturb each other without direct transmission' } },
    { id: 'Perturbation',              label: 'Perturbation',                state: 'MASTER', props: { definition: 'A trigger that causes internal reorganization — not an instruction' } },
    { id: 'Paradigm',                  label: 'Paradigm',                    state: 'MASTER', props: { definition: 'A set of distinctions that constitute a coherent worldview' } },
    { id: 'ParadigmShift',             label: 'Paradigm Shift',              state: 'MASTER', props: { definition: 'The redrawing of foundational distinctions at scale' } },
    { id: 'EntailmentMesh',            label: 'Entailment Mesh',             state: 'MASTER', props: { definition: 'A multidimensional web of conceptual dependencies — the non-linear curriculum' } },
    { id: 'ZoneOfProximalDevelopment', label: 'Zone of Proximal Development',state: 'MASTER', props: { definition: 'The conceptual frontier immediately beyond current understanding' } },
  ],
  edges: [
    { src: 'Distinction',              dst: 'MarkedSpace',            rel: 'CREATES',                    weight: 1.0 },
    { src: 'Distinction',              dst: 'UnmarkedSpace',          rel: 'CREATES',                    weight: 1.0 },
    { src: 'Distinction',              dst: 'Boundary',               rel: 'IS_DEFINED_BY',              weight: 1.0 },
    { src: 'Boundary',                 dst: 'MarkedSpace',            rel: 'SEPARATES',                  weight: 1.0 },
    { src: 'Boundary',                 dst: 'UnmarkedSpace',          rel: 'SEPARATES',                  weight: 1.0 },
    { src: 'ReEntry',                  dst: 'Oscillation',            rel: 'CAUSES',                     weight: 1.0 },
    { src: 'ReEntry',                  dst: 'Boundary',               rel: 'REFERENCES',                 weight: 0.9 },
    { src: 'TheCrossing',              dst: 'Boundary',               rel: 'TRAVERSES',                  weight: 1.0 },
    { src: 'TheCrossing',              dst: 'Mastery',                rel: 'DEMONSTRATES',               weight: 1.0 },
    { src: 'Observer',                 dst: 'Distinction',            rel: 'PERFORMS',                   weight: 1.0 },
    { src: 'Observer',                 dst: 'BlindSpot',              rel: 'INHERENTLY_POSSESSES',       weight: 1.0 },
    { src: 'BlindSpot',                dst: 'UnmarkedSpace',          rel: 'CORRESPONDS_TO',             weight: 0.9 },
    { src: 'FirstOrderObservation',    dst: 'Observer',               rel: 'PERFORMED_BY',               weight: 1.0 },
    { src: 'SecondOrderObservation',   dst: 'FirstOrderObservation',  rel: 'OBSERVES',                   weight: 1.0 },
    { src: 'SecondOrderObservation',   dst: 'BlindSpot',              rel: 'REVEALS',                    weight: 1.0 },
    { src: 'Autopoiesis',              dst: 'OperationalClosure',     rel: 'REQUIRES',                   weight: 1.0 },
    { src: 'OperationalClosure',       dst: 'Perturbation',           rel: 'RESPONDS_TO',                weight: 1.0 },
    { src: 'StructuralCoupling',       dst: 'Perturbation',           rel: 'OPERATES_THROUGH',           weight: 1.0 },
    { src: 'StructuralCoupling',       dst: 'OperationalClosure',     rel: 'PRESUPPOSES',                weight: 1.0 },
    { src: 'Paradigm',                 dst: 'Distinction',            rel: 'COMPOSED_OF',                weight: 1.0 },
    { src: 'ParadigmShift',            dst: 'Paradigm',               rel: 'REDRAWS',                    weight: 1.0 },
    { src: 'ParadigmShift',            dst: 'TheCrossing',            rel: 'IS_A_LARGE_SCALE',           weight: 0.8 },
    { src: 'EntailmentMesh',           dst: 'Distinction',            rel: 'MAPS_RELATIONSHIPS_BETWEEN', weight: 1.0 },
    { src: 'ZoneOfProximalDevelopment',dst: 'EntailmentMesh',         rel: 'CALCULATED_FROM',            weight: 1.0 },
    { src: 'ZoneOfProximalDevelopment',dst: 'Boundary',               rel: 'IDENTIFIES_NEXT',            weight: 1.0 },
  ],
};

export const ALL_SEEDS: SeedData[] = [LAWS_OF_FORM];

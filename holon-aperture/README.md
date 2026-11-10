# Holon Aperture

An artificial-life simulator in which every level of organisation climbs the
same six rungs, everything pays to persist, and the order that emerges is read
through an aperture: stop it down and higher-order structure comes into focus.

Open `index.html` in a browser. There is nothing to install or build.

Two commitments shape it:

- **Raw capacity is relative to the observer.** Whatever level the aperture
  resolves is "the body": one unit that harvests as a whole. Everything inside
  it is finished history, everything above it is what it may become.
- **Complexity is built from the deepest question.** A world does not start
  with space, particles or genes. It starts with elements that cannot be told
  apart, and the simulator marks exactly where derivation stops and assumption
  begins.

## The idea

A *holon* is a whole that is also a part. Motes are the smallest holons. Cells
are made of motes, Bodies of cells, Colonies of bodies, Biomes of colonies.
All five levels run the same code:

| Rung | What happens | How it is implemented |
|------|--------------|-----------------------|
| I Embody | A holon harvests free energy with its own body. | Motes absorb the field cell under them. Higher holons collect through sample points on their membrane. |
| II Externalise | It moves a function out of its body and into the world. | It spends energy depositing *works* into a structure field. Works raise local energy capture and do part of the harvest for whoever stands on them. They decay. |
| III Coordinate | Peers bond through the shared works. | Bonds form where works exist. Bonded peers share energy and couple their phase oscillators. Coordinated builders get more structure per unit of energy. |
| IV Crisis | Flat coordination stops scaling. | Consensus among *n* peers costs each one `k·(n−1)^β`. The benefit saturates. A coalition spending more than a quarter of its income on consensus is in crisis. |
| V Transcend | The coalition becomes a higher-order system. | It either fragments or closes a membrane. The membrane replaces pairwise consensus with a linear hub cost, shelters members, taxes them (so nobody free-rides), and reproduces as a unit by fission. |
| VI Recurse | The new whole is a part again. | The new holon is a single body at the next level. It starts at rung I. |

Nothing is scheduled. Each rung is *measured* from what the population is
doing, and each can be knocked out to see what stalls above it.

### Persistence cost

Per tick a mote pays

    c = P·(m0·s^d + mc·capacity) + mv·motility + bonds + k·(n−1)^β + deposits

where `d` is how many membranes enclose it and `s < 1` the shelter each gives.
A membrane costs its holon `cm·√mass + ch·mass`, so upkeep per member falls
with size. A mote that cannot pay dies and returns its matter to the field.
Matter is conserved, energy flows through.

## Where a world comes from

Every step in the simulator has the same shape: *what there is → what happens
→ what results*, and the result is the raw capacity of the next step. The
first six steps are enacted before any geometry exists (`Origin` in `sim.js`):

| Step | What the simulator does | What it measures (seed 7) |
|------|-------------------------|---------------------------|
| indistinguishability → first differentiation → distinguishable alternatives | 320 elements with no properties and no relations. One is marked; nothing explains which (it is the seed's first random draw). | Colour refinement (1-WL) counts which elements their relations can tell apart: 1 class, then 2, finally all 320. |
| → relations and constraints → structured possibilities | Relations form under two constraints: every relation closes a triple, and a pair is shared by at most two triples. | 891 relations. |
| → admissible transition rules → possible transformations | Two rewrite rules: *extend* (a related pair on the rim recruits an unrelated element) and *close* (an element with six relations seals its neighbours). | 317 extends, 254 closes. |
| → composition → structured histories | Rule applications are composed. | 573 events. |
| → ordering and clock relations → candidate temporal structure | Each event depends on the events that last touched its inputs. That is a partial order with a depth. | 82 causal steps, about 7 events per instant. |
| → distance constructions → candidate geometry | Distance is the shortest relation path. Dimension is the exponent of ball growth. | Balls grow as r^1.99 over a radius of 12. |

Nothing in those rules mentions a plane. The dimension of 1.96–1.99 across
seeds is measured, not put in.

The next two steps are **assumed, and labelled as assumed** everywhere they
appear: laying the sheet onto a 192 × 128 field and calling it space, and the
energy field with its rules (inflow, diffusion, harvest, decay). The clock of
the living world is its own tick, not the causal order of the origin. No
quantum theory is simulated.

### The stack

`tools/chain-source.txt` holds the full generative chain in its author's
words: 120 steps in 13 epochs, from hypothesised indistinguishability to one
human in a shared world, with six open questions marked. `tools/build-chain.js`
turns it into `chain.js` without rewording anything. In the app, *The stack*
shows every step with one of five honest states:

- **Enacted in this world**: the six pre-geometric steps above, with live values.
- **Assumed, not derived**: the two steps the simulator puts in by hand.
- **Analogue observed**: 15 later steps (imperfect copying, differential
  reproduction, retention within compartments, division, adhesion or
  incomplete separation, conflict suppression and others) have a working
  analogue here, detected by measurement (`World.prototype.analogues`).
- **Not yet observed**: an analogue exists but this run has not shown it.
- **Outside this model**: 97 steps the simulator makes no claim about.

An analogue is a measurement in this toy world. It is not evidence about how
the real transition happened.

## The mathematics of the aperture

A run starts as a featureless energy field. Motes condense at random places
with uniformly random genomes. That is the maximum-entropy state: it holds no
information, so it is indistinguishable from any other draw of the same noise.

Order is defined as distance from that state. With `p` the share of motes in
each block of a grid and `u` the uniform share, the relative entropy
`D(p‖u) = Σ p log2(p/u)` is the rate at which an observer gathers evidence
that the world is not noise (Chernoff–Stein: the chance of mistaking it for
noise after N samples falls as `2^(−N·D)`).

Two refinements make it usable:

1. **Noise floor.** `G = 2N·D·ln 2` is the log-likelihood-ratio statistic.
   Its exact mean and variance under a Poisson null are computed and
   subtracted, so random points read as zero with a z-score (`test/check.js`
   verifies this: mean z ≈ 0, max |z| < 4).
2. **Scale resolution.** Relative entropy obeys a chain rule under
   coarse-graining: `D(fine) = D(coarse) + ⟨D(fine | coarse)⟩`. Halving the
   resolution six times, from 10-unit to 640-unit blocks, splits the total
   into seven additive terms, one per octave of scale.

That decomposition is the **order spectrum**. Positive bars are clustering,
negative bars are spacing more even than chance (territory, packing), hollow
bars are within 3σ of noise. Zooming out does not lose the order of the higher
levels. It is the only place that order can be seen.

The Genome panel applies the same measure to trait space: bits per mote by
which selection has moved the population away from the uniform genome.

## Using it

- **Viewport.** Scroll or pinch to zoom, drag to pan, click to inspect any
  holon. With *Auto* on, zooming out stops the aperture down (f/1.4 resolves
  Motes, f/22 resolves Biomes). Levels below the focus melt into haze, the
  level in focus is drawn crisp.
- **Views.** *Life*, *Energy* (the free-energy field), *Works* (externalised
  structure by level), *Order* (each block at the current aperture coloured by
  how far its density is from chance).
- **The ladder.** Rows are levels, columns are rungs. Fill is how strongly
  the rung is expressed now, a dot means the threshold has been crossed.
- **History.** Where the motes live (free, in Cells, in Bodies…) and a
  spectrogram of order per scale, with milestone markers.
- **Dials.** Energy flux, persistence cost, entropy, the consensus exponent β,
  mutation and spontaneity apply live. Presets restart the world.
- **Shocks.** Extinction and entropy storm, plus Feed and Burn brushes.
- **Data.** Copy the time series as CSV or the run record as JSON. Runs are
  seeded and reproducible.

### Things to study

- Mote *capacity* collapses after the first Cells: once membranes harvest,
  bodies shed embodied capacity they no longer need.
- Raise β and the crisis arrives earlier, so Cells stay small.
- After an extinction, which scales of the order spectrum are lost first?
- With membranes knocked out, can coordination alone hold large-scale order?

## Files

| File | |
|------|-|
| `sim.js` | Simulation core: the pre-geometric `Origin`, the `World`, and the measurements. No DOM access, runs unchanged in Node. |
| `chain.js` | The generative chain as data. Generated: `npm run chain`. |
| `tools/chain-source.txt` | The chain in its original wording. Edit this, not `chain.js`. |
| `app.js` | Viewport rendering, instruments, controls. |
| `index.html`, `style.css` | Page and styles (light and dark themes). |
| `test/check.js` | Regression checks: `npm test`. |
| `test/run.js` | Headless run with a log line per 1000 ticks: `node test/run.js 20000 7 beta=1.5`. |
| `tools/build-artifact.js` | Bundles everything into one self-contained file: `npm run build`. |

With the default dials and seed 7, the first Cell closes near tick 700, the
first Body near tick 4,200 and the first Colony near tick 22,000. Other seeds
vary widely: across four seeds the first Body arrived between ticks 2,500 and
7,400, and two of the four reached a Biome within 25,000 ticks. At 1× speed
the simulation runs 60 ticks per second.

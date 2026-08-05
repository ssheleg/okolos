# @okolos/core-injection

Stage 1 of the AI Shield: hidden-text candidates in, verdicts out. Pure — no
DOM, no clock, no network.

The design turns on one distinction. Hidden text by itself is ordinary:
screen-reader labels, inactive tabs, structured data and print-only footers are
all invisible on purpose. What is never ordinary is invisible text that
addresses a model, reassigns its role, cancels its prior instructions, asks it
to keep a secret from the user, or reaches for their credentials.

Nine signals encode that, and every one of them is checkable by a person reading
the same text — which is what earns this stage the right to act while the
classifier is capped at `inform`.

Corpus: `corpora/injections/`. 20 planted injections, 20 legitimately hidden
passages. Recall at or above 90%, zero findings on the clean set, both enforced
as tests.

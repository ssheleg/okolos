# @okolos/ui

Surfaces: the in-page banner and the self-audit panel. No framework — this code
runs inside every page the user opens, and a runtime shipped there is weight
they pay for on every navigation.

The banner renders into a **closed** shadow root: page CSS cannot restyle it,
page scripts cannot read or remove it. A hostile page able to hide the warning
about itself would make the surface pointless. Severity is stated in words,
because colour alone fails a colour-blind reader and vanishes in high contrast.

The self-audit panel treats its states as claims. Empty is a sentence, not an
empty table. A read failure says explicitly that it is a storage problem and not
a statement that nothing was sent.

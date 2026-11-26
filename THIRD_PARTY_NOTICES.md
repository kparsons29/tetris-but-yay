# Third-party notices

## Cold Clear

The bot engine is the original Cold Clear project by MinusKelvin:
https://github.com/MinusKelvin/cold-clear

This project builds the `cold-clear`, `libtetris`, and `cc-tbp` crates from
upstream revision `279edd7c3177ff8077f6a930193397814b281f27`. The original
search engine and its board evaluation are not reimplementations.

The build applies the small patch in `cold-clear/patches/disable-hold.patch`
to the upstream TBP adapter. Hold is disabled because TBP v1.0's suggestion
message does not report whether the engine used hold, and the game needs
unambiguous queue synchronization. The underlying Cold Clear search engine
is otherwise built from the pinned upstream source.

Cold Clear is licensed under the Mozilla Public License, version 2.0
(MPL-2.0). The license text is included at `licenses/MPL-2.0.txt`.
The upstream source and build instructions are available at the repository
URL above.

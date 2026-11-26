# Third-party notices

## Cold Clear

The bot engine is based on the original Cold Clear project by MinusKelvin:
https://github.com/MinusKelvin/cold-clear

The WebAssembly wrapper links the Cold Clear engine and libtetris from upstream
revision `7cb2f8d`. Cold Clear is licensed under the Mozilla Public License,
version 2.0 (MPL-2.0). The upstream license text is available at:
https://github.com/MinusKelvin/cold-clear/blob/master/LICENSE

The generated Cold Clear WebAssembly files are compiled from that upstream
source. They are not a reimplementation of the Cold Clear search algorithm.

## webutil

Cold Clear's browser worker implementation uses the upstream `webutil` crate,
which is part of the Cold Clear dependency tree:
https://github.com/MinusKelvin/webutil

See the upstream repository for its applicable license and copyright notices.

# Aircraft 3D Models — Attribution & License

The realistic aircraft `.glb` models in this folder are sourced from two
open-source flight-tracker model sets:

- **FlightAirMap 3D Models** — https://github.com/Ysurac/FlightAirMap-3dmodels
- **BelugaProject 3D Models** — https://github.com/amnesica/BelugaProject-3D-Models

Both projects distribute their aircraft models under the **GNU GPL**
(FlightAirMap: GPL-2.0; BelugaProject: GPL-3.0).

## License note
These models are free to download and use. The GPL is a copyleft license —
if this simulation is distributed as a proprietary/closed product, review
whether GPL asset bundling is acceptable for your distribution, or replace
these files with CC0/CC-BY or commercially-licensed equivalents. The model
loader (`src/lib/aircraft-models.ts`) is drop-in: replacing a file here with
a same-named `.glb` swaps the model with no code changes.

The Boom Overture has no community model and uses the built-in procedural
mesh instead.

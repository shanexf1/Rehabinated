# Sources behind numbers in the knee ROM skill

- Measurement error, gait, MediaPipe vs Kinovea: mean absolute knee-angle error
  5.88°, correlation 0.941. "Knee Flexion/Extension Angle Measurement for Gait
  Analysis Using Machine Learning Solution 'MediaPipe Pose' and Its Comparison
  with Kinovea", IOP Conf. Ser.: Mater. Sci. Eng. 1279, 012004,
  doi:10.1088/1757-899x/1279/1/012004.
- Static accuracy, BlazePose vs goniometer at 30/60/90/120°: angle-dependent,
  RMSE about 15.5°, overestimates shallow and underestimates deep flexion.
  Included hip-knee-ankle angles converted to clinical flexion (0° = full
  extension). Yue XA, Gu Y, Yu B. JMIR Rehabil Assist Technol 2026;13:e102399.
- Normal knee motion and the need to compare with the other knee:
  "What is 'Normal' Knee ROM?", PMC3435893 (0° extension, 135° flexion as a
  common definition; many people have hyperextension and more flexion).
- Normative ROM dataset: Soucie JM et al. 2010, CDC public-use dataset for
  normal joint range of motion (674 subjects), stacks.cdc.gov/view/cdc/153156.

Thresholds in SKILL.md (visibility 0.5, segment 15%, tolerance 5°, flexion
cap 150°, pain 6/10 or +2) are team-chosen screening defaults informed by the
error magnitudes above. They are not validated clinical cut-offs.

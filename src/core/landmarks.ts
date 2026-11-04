import type { Joint, Side } from './types';

/** MediaPipe Pose 33-landmark indices. Other pose models are mapped onto this layout by their adapter. */
export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFoot: 31,
  rightFoot: 32,
} as const;

export const LANDMARK_COUNT = 33;

const JOINT_INDEX: Record<Joint, Record<Side, number>> = {
  shoulder: { left: LM.leftShoulder, right: LM.rightShoulder },
  elbow: { left: LM.leftElbow, right: LM.rightElbow },
  wrist: { left: LM.leftWrist, right: LM.rightWrist },
  hip: { left: LM.leftHip, right: LM.rightHip },
  knee: { left: LM.leftKnee, right: LM.rightKnee },
  ankle: { left: LM.leftAnkle, right: LM.rightAnkle },
  heel: { left: LM.leftHeel, right: LM.rightHeel },
  foot: { left: LM.leftFoot, right: LM.rightFoot },
};

export function jointIndex(joint: Joint, side: Side): number {
  return JOINT_INDEX[joint][side];
}

/** Bones to draw for the skeleton overlay. */
export const SKELETON_EDGES: [number, number][] = [
  [LM.leftShoulder, LM.rightShoulder],
  [LM.leftShoulder, LM.leftElbow],
  [LM.leftElbow, LM.leftWrist],
  [LM.rightShoulder, LM.rightElbow],
  [LM.rightElbow, LM.rightWrist],
  [LM.leftShoulder, LM.leftHip],
  [LM.rightShoulder, LM.rightHip],
  [LM.leftHip, LM.rightHip],
  [LM.leftHip, LM.leftKnee],
  [LM.leftKnee, LM.leftAnkle],
  [LM.rightHip, LM.rightKnee],
  [LM.rightKnee, LM.rightAnkle],
  [LM.leftAnkle, LM.leftHeel],
  [LM.leftHeel, LM.leftFoot],
  [LM.rightAnkle, LM.rightHeel],
  [LM.rightHeel, LM.rightFoot],
];

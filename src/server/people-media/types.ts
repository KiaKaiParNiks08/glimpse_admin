export type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DetectedFace = {
  confidence: number;
  box: FaceBox;
  embedding: number[];
};

export type FaceDetectInput = {
  bytes: Buffer;
  contentType: string;
  mediaType: 'image' | 'video';
};

/** Replaceable face backend. Implementations must not be called from upload requests. */
export interface FaceProvider {
  readonly name: string;
  detectFaces(input: FaceDetectInput): Promise<DetectedFace[]>;
}

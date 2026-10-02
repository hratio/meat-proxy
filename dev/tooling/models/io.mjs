import { NodeIO, Logger } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco from 'draco3dgltf';

/** Build/test tools only. Browser decoding uses Three's worker pool. */
export async function createModelIO(encode = false) {
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco.createDecoderModule(),
    ...(encode ? { 'draco3d.encoder': await draco.createEncoderModule() } : {})
  }).setLogger(new Logger(Logger.Verbosity.ERROR));
}

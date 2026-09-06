import { detectGiftQuality, resolveRenderType } from './giftQuality';
import { CssGiftRenderer, StaticGiftRenderer } from './CssGiftRenderer';
import { ThreeDVideoGiftRenderer, LottieGiftRenderer } from './ThreeDVideoGiftRenderer';
import { WebGLGiftRenderer } from './WebGLGiftRenderer';

export function GiftRenderer({
  gift,
  mode = 'preview',
  still = false,
  quality: qualityProp,
  size,
}) {
  if (!gift) return null;
  const quality = qualityProp || detectGiftQuality();
  const type = resolveRenderType(gift, { mode, quality });

  if (type === '3d_video') {
    return (
      <ThreeDVideoGiftRenderer gift={gift} mode={mode} still={still}>
        {gift.renderType === 'webgl'
          ? <WebGLGiftRenderer gift={gift} mode={mode} still={still} quality={quality} />
          : <CssGiftRenderer gift={gift} mode={mode} still={still} size={size} quality={quality} />}
      </ThreeDVideoGiftRenderer>
    );
  }
  if (type === 'lottie') {
    return gift.previewUrl
      ? <LottieGiftRenderer gift={gift} />
      : <CssGiftRenderer gift={gift} mode={mode} still={still} size={size} quality={quality} />;
  }
  if (type === 'webgl') {
    return <WebGLGiftRenderer gift={gift} mode={mode} still={still} quality={quality} />;
  }
  if (type === 'static') {
    return <StaticGiftRenderer gift={gift} mode={mode} size={size} quality={quality} />;
  }
  return <CssGiftRenderer gift={gift} mode={mode} still={still} size={size} quality={quality} />;
}

export function GiftManager({ gift, ...rest }) {
  return <GiftRenderer gift={gift} {...rest} />;
}

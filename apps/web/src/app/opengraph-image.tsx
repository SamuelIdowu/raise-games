import { ImageResponse } from 'next/og';

export default function OGImage() {
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '1200px',
        height: '630px',
        background: '#0A0C0D',
        color: '#F1EEE8',
        fontFamily: 'system-ui, sans-serif',
        padding: '60px',
      }}
    >
      <div
        style={{
          fontSize: '72px',
          fontWeight: '700',
          letterSpacing: '-2px',
          lineHeight: '1.1',
          textAlign: 'center',
          marginBottom: '24px',
        }}
      >
        RAISE
      </div>
      <div
        style={{
          fontSize: '28px',
          fontWeight: '400',
          color: '#B8BCC0',
          textAlign: 'center',
          marginBottom: '40px',
          maxWidth: '800px',
        }}
      >
        Free 1v1 challenges for eFootball, Call of Duty: Mobile & PUBG Mobile
      </div>
      <div
        style={{
          display: 'flex',
          gap: '24px',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            background: 'rgba(255,79,0,0.15)',
            border: '1px solid #FF4F00',
            color: '#FF4F00',
            padding: '8px 24px',
            borderRadius: '9999px',
            fontSize: '16px',
            fontWeight: '600',
          }}
        >
          eFootball
        </span>
        <span
          style={{
            background: 'rgba(255,79,0,0.15)',
            border: '1px solid #FF4F00',
            color: '#FF4F00',
            padding: '8px 24px',
            borderRadius: '9999px',
            fontSize: '16px',
            fontWeight: '600',
          }}
        >
          Call of Duty: Mobile
        </span>
        <span
          style={{
            background: 'rgba(255,79,0,0.15)',
            border: '1px solid #FF4F00',
            color: '#FF4F00',
            padding: '8px 24px',
            borderRadius: '9999px',
            fontSize: '16px',
            fontWeight: '600',
          }}
        >
          PUBG Mobile
        </span>
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: '40px',
          fontSize: '14px',
          color: '#7C8186',
        }}
      >
        raise.ng · Verified results · No wallet required
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
    },
  );
}

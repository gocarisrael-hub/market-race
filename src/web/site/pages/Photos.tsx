// The photos of an order outside the build: opened from the manage page (until the game starts) or
// from a link on another device. The build's own photos stage is in build/stages.tsx.
import { useState } from 'react'
import { Doodles } from '../../shared/decor.tsx'
import type { Shop } from '../api.ts'
import { copy } from '../copy.ts'
import { PhotosPanel } from '../photos-panel.tsx'
import { Back, Cta, Deco, TitleIcon } from '../ui.tsx'

export function Photos(props: { token: string; shop: Shop }) {
  const { token } = props
  const [paid, setPaid] = useState(false)
  return (
    <main className="page">
      <Doodles
        className="deco"
        decor="generic"
        spots={[
          { top: 330, left: 8, size: 46, rot: 10 },
          { top: 620, left: -8, size: 40, rot: -8 },
        ]}
      />
      <Deco
        icon="coffee"
        className="bob"
        style={{ top: 30, left: -10, width: 70, ['--r' as string]: '8deg' }}
      />
      <Back href={`/m/${token}`} />
      <div style={{ marginTop: 18, marginLeft: 40 }}>
        <div className="title-row">
          <h1 className="title rise" style={{ fontSize: 56 }}>
            {copy.photos.title('group')}
          </h1>
          <TitleIcon icon="camera" />
        </div>
        <p className="lead">{copy.photos.intro}</p>
        <p className="hint">{copy.photos.bgHint}</p>
        <p className="photos-where">
          {copy.photos.where}
          <span className="hint"> {copy.photos.order}</span>
        </p>
      </div>
      <PhotosPanel token={token} onPaid={setPaid} />
      {paid ? (
        <Cta href={`/m/${token}`}>{copy.photos.done}</Cta>
      ) : (
        <Cta href={`/order/${token}/pay`}>{copy.photos.next}</Cta>
      )}
    </main>
  )
}

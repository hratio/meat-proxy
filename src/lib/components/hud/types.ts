import type { HudSettings } from '$lib/hud-config';

export type HudIconName = 'skull' | 'shield' | 'target';
export type HudDisplayMode = 'detailed' | 'compact';
export type HudFrameVariant = 'panel' | 'portrait' | 'inset' | 'bracket';
export type HudFrameEdge = 'left' | 'top';
export type HudFrameArtProps = {
  width: number;
  height: number;
  variant: HudFrameVariant;
  openEdge?: HudFrameEdge;
};

export type HudFinding = {
  group: string;
  code: string;
  title: string;
  color: string;
  icon: HudIconName;
  example: string;
};

export type HudLayout = Pick<HudSettings, 'width' | 'leftWeight' | 'rightWeight' | 'centerWidth' | 'codeHeight' | 'portraitHeight' | 'gap' | 'codeSize'>;

export const demoFindings: [HudFinding, HudFinding] = [
  {
    group: 'Security', code: 'V011', title: 'Untrusted input', color: '#f27569', icon: 'skull',
    example: `const name = request.query["name"];\nconst sql = "SELECT * FROM users WHERE name='"\n  + name + "'";\nconst rows = await db.query(sql);\nrender(rows);\naudit(name);`
  },
  {
    group: 'Correctness', code: 'V001', title: 'Unchecked assumption', color: '#c5adea', icon: 'skull',
    example: `const user = session.currentUser;\nconst role = user.role;\nif (role === "admin") {\n  grantAccess();\n}\nlog(role);`
  }
];

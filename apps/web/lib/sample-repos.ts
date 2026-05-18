import type { LaunchStatus } from '@/lib/format/status';

export type SampleTag = 'benchmark' | 'typicalIssues' | 'minimal';

export interface SampleRepo {
  id: string;
  name: string;
  description: string;
  repoUrl: string;
  expectedStatus: LaunchStatus;
  tag: SampleTag;
}

export const SAMPLE_REPOS: SampleRepo[] = [
  {
    id: 'neovim',
    name: 'neovim/neovim',
    description:
      '대형 C 코드베이스. README/CI/문서 모두 잘 갖춰진 벤치마크용 저장소.',
    repoUrl: 'https://github.com/neovim/neovim',
    expectedStatus: 'ready',
    tag: 'benchmark',
  },
  {
    id: 'deno',
    name: 'denoland/deno',
    description:
      'Rust + TypeScript 런타임. 의존성 관리, 보안 정책, 테스트 커버리지가 우수합니다.',
    repoUrl: 'https://github.com/denoland/deno',
    expectedStatus: 'ready',
    tag: 'benchmark',
  },
  {
    id: 'fastapi',
    name: 'tiangolo/fastapi',
    description:
      '활발한 Python 웹 프레임워크. 문서와 타이핑 정합성으로 출시 가능 판정 예상.',
    repoUrl: 'https://github.com/tiangolo/fastapi',
    expectedStatus: 'ready_with_improvements',
    tag: 'benchmark',
  },
  {
    id: 'create-react-app',
    name: 'facebook/create-react-app',
    description:
      '유지보수가 멈춘 대표적 예시. 의존성 취약점·deprecation 경고가 다수 잡힙니다.',
    repoUrl: 'https://github.com/facebook/create-react-app',
    expectedStatus: 'needs_work',
    tag: 'typicalIssues',
  },
  {
    id: 'js-jquery-broken',
    name: 'jquery/esprima',
    description:
      '구버전 의존성과 README 부족 패턴. 전형적인 개선 권장 사례를 보여줍니다.',
    repoUrl: 'https://github.com/jquery/esprima',
    expectedStatus: 'needs_work',
    tag: 'typicalIssues',
  },
  {
    id: 'hello-world',
    name: 'octocat/Hello-World',
    description:
      '최소 구성 저장소. README도 없고 코드도 한 줄. 분석 표면 부족(INDETERMINATE) 케이스 학습용.',
    repoUrl: 'https://github.com/octocat/Hello-World',
    expectedStatus: 'indeterminate',
    tag: 'minimal',
  },
];

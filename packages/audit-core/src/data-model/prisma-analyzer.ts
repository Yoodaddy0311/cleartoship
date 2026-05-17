// Prisma schema static analyzer — emits NormalizedFindings for the
// DATA_MODEL audit category. Pure function: takes an absolute schema
// path + optional file reader (injected in tests) and returns findings.
//
// Source: ClearToShip audit checklist §DATA_MODEL.

import { promises as fsp } from 'node:fs';
import type { NormalizedFinding, NormalizedEvidence } from '../adapter.js';

export interface AnalyzePrismaInput {
  schemaPath: string;
  readFile?: (p: string) => Promise<string>;
}

interface ModelField {
  name: string;
  type: string;
  rawType: string;
  attributes: string;
  isList: boolean;
  isOptional: boolean;
  line: number;
  raw: string;
}

interface ParsedModel {
  name: string;
  startLine: number;
  endLine: number;
  fields: ModelField[];
  raw: string;
}

const SENSITIVE_NAME_RE = /(password|secret|token|apikey|api_key)/i;
const FK_SUFFIX_RE = /^(.+?)(?:Id|_id)$/;
const SCALAR_TYPES = new Set([
  'String',
  'Int',
  'BigInt',
  'Float',
  'Decimal',
  'Boolean',
  'DateTime',
  'Json',
  'Bytes',
]);

function parseSchema(source: string): ParsedModel[] {
  const lines = source.split(/\r?\n/);
  const models: ParsedModel[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const match = /^\s*model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/.exec(line);
    if (!match) {
      i++;
      continue;
    }
    const name = match[1]!;
    const startLine = i + 1;
    const fields: ModelField[] = [];
    let j = i + 1;
    while (j < lines.length) {
      const cur = lines[j] ?? '';
      if (/^\s*\}/.test(cur)) {
        break;
      }
      const trimmed = cur.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) {
        j++;
        continue;
      }
      const fm = /^([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)(\[\])?(\?)?(.*)$/.exec(
        trimmed,
      );
      if (fm) {
        const [, fname, ftype, list, opt, attrs] = fm;
        fields.push({
          name: fname!,
          type: ftype!,
          rawType: `${ftype}${list ?? ''}${opt ?? ''}`,
          attributes: (attrs ?? '').trim(),
          isList: Boolean(list),
          isOptional: Boolean(opt),
          line: j + 1,
          raw: cur,
        });
      }
      j++;
    }
    models.push({
      name,
      startLine,
      endLine: j + 1,
      fields,
      raw: lines.slice(i, j + 1).join('\n'),
    });
    i = j + 1;
  }
  return models;
}

function makeEvidence(
  schemaPath: string,
  lineStart: number,
  lineEnd: number,
  snippet: string,
): NormalizedEvidence {
  return {
    type: 'FILE',
    source: 'prisma-analyzer',
    path: schemaPath,
    lineStart,
    lineEnd,
    url: null,
    selector: null,
    screenshotPath: null,
    snippet,
    maskedValue: null,
    metadata: null,
  };
}

function checkMissingId(model: ParsedModel, schemaPath: string): NormalizedFinding | null {
  const hasId =
    /@id\b/.test(model.raw) || /@@id\s*\(/.test(model.raw);
  if (hasId) return null;
  return {
    title: `Prisma: ${model.name} 모델에 기본 키가 없습니다`,
    category: 'DATA_MODEL',
    severity: 'P0',
    confidence: 'HIGH',
    summary: `${model.name} 모델에 @id 또는 @@id 정의가 없습니다.`,
    nonDeveloperExplanation:
      '데이터마다 고유한 식별자가 없으면 동일한 정보가 중복 저장되거나, 특정 사용자/주문 등을 정확히 찾지 못해 운영에 큰 혼란이 발생할 수 있습니다.',
    technicalExplanation: `R1 MISSING_ID: model ${model.name} declared without @id field-level or @@id model-level attribute.`,
    impact: '기본 키 없는 테이블은 update/delete 시 row 식별 불가, 인덱스 누락으로 인한 성능 저하, 마이그레이션 실패 가능성.',
    recommendation: [
      '예시: 단일 컬럼 PK를 추가하세요.',
      '```prisma',
      `model ${model.name} {`,
      '  id  String  @id @default(cuid())',
      '  // ... other fields',
      '}',
      '```',
    ].join('\n'),
    acceptanceCriteria: [`${model.name} 모델이 @id 또는 @@id 를 통해 기본 키를 가지게 되었다.`],
    tags: ['prisma', 'data-model', 'R1_MISSING_ID'],
    evidences: [makeEvidence(schemaPath, model.startLine, model.endLine, model.raw.slice(0, 500))],
  };
}

function checkStringLength(
  model: ParsedModel,
  field: ModelField,
  schemaPath: string,
): NormalizedFinding | null {
  if (field.type !== 'String') return null;
  if (/@id\b/.test(field.attributes)) return null;
  if (/@db\.(VarChar|Text|Char)\s*\(?/.test(field.attributes)) return null;
  if (/@db\.\w+/.test(field.attributes)) return null;
  return {
    title: `Prisma: ${model.name}.${field.name} 문자열 길이 제약 누락`,
    category: 'DATA_MODEL',
    severity: 'P1',
    confidence: 'MEDIUM',
    summary: `${model.name}.${field.name} (String) 에 @db.VarChar(N) 또는 @db.Text 같은 길이/타입 어노테이션이 없습니다.`,
    nonDeveloperExplanation:
      '글자 수 제한 없는 입력 칸을 두면 사용자가 매우 긴 글을 저장해 저장공간을 낭비하거나, 검색이 느려지거나, 악의적인 대용량 입력 공격에 노출될 수 있습니다.',
    technicalExplanation: `R2 STRING_NO_LENGTH: field ${model.name}.${field.name} of type String has no @db.* annotation. Default Postgres mapping is TEXT, MySQL is VARCHAR(191) — both differ across providers.`,
    impact: 'DB 별 기본 타입 차이로 인한 마이그레이션 비호환, 인덱스 비효율, 의도치 않은 대용량 저장 위험.',
    recommendation: [
      '용도에 맞는 길이 제약을 명시하세요.',
      '```prisma',
      `${field.name}  ${field.rawType}  @db.VarChar(255)`,
      `// 또는 긴 본문이면`,
      `${field.name}  ${field.rawType}  @db.Text`,
      '```',
    ].join('\n'),
    acceptanceCriteria: [
      `${model.name}.${field.name} 에 적절한 @db 어노테이션이 추가되었다.`,
    ],
    tags: ['prisma', 'data-model', 'R2_STRING_NO_LENGTH'],
    evidences: [makeEvidence(schemaPath, field.line, field.line, field.raw)],
  };
}

function checkOneWayRelation(
  model: ParsedModel,
  field: ModelField,
  schemaPath: string,
  modelsByName: Map<string, ParsedModel>,
): NormalizedFinding | null {
  if (SCALAR_TYPES.has(field.type)) return null;
  const target = modelsByName.get(field.type);
  if (!target) return null;
  const hasBack = target.fields.some(
    (f) => f.type === model.name && (f.isList || f.isOptional || true),
  );
  if (hasBack) return null;
  return {
    title: `Prisma: ${model.name} → ${field.type} 단방향 관계`,
    category: 'DATA_MODEL',
    severity: 'P1',
    confidence: 'MEDIUM',
    summary: `${model.name}.${field.name} 이 ${field.type} 을 참조하지만 ${field.type} 쪽에 역참조 필드가 없습니다.`,
    nonDeveloperExplanation:
      '한쪽에서만 다른 데이터를 연결해 두면, 반대편에서 누가 자신을 참조하는지 확인하기 어려워 데이터가 꼬이거나 누락된 채로 방치될 수 있습니다.',
    technicalExplanation: `R3 ONE_WAY_RELATION: ${model.name}.${field.name}: ${field.rawType} references ${field.type} but ${field.type} has no field of type ${model.name}/${model.name}[].`,
    impact: '양방향 관계 누락은 ORM 레벨 무결성 검사 어려움, 잘못된 cascade 동작 가능성.',
    recommendation: [
      `${field.type} 모델에 역참조 필드를 추가하세요.`,
      '```prisma',
      `model ${field.type} {`,
      '  // ...',
      `  ${model.name.toLowerCase()}s  ${model.name}[]`,
      '}',
      '```',
    ].join('\n'),
    acceptanceCriteria: [
      `${field.type} 모델에 ${model.name} 역참조 필드가 추가되었다.`,
    ],
    tags: ['prisma', 'data-model', 'R3_ONE_WAY_RELATION'],
    evidences: [makeEvidence(schemaPath, field.line, field.line, field.raw)],
  };
}

function checkTimestamp(
  model: ParsedModel,
  field: ModelField,
  schemaPath: string,
): NormalizedFinding | null {
  if (field.type !== 'DateTime') return null;
  const nameLower = field.name.toLowerCase();
  const isCreated = nameLower === 'createdat' || nameLower === 'created_at';
  const isUpdated = nameLower === 'updatedat' || nameLower === 'updated_at';
  if (!isCreated && !isUpdated) return null;
  const hasDefault = /@default\s*\(\s*now\s*\(\s*\)\s*\)/.test(field.attributes);
  const hasUpdatedAt = /@updatedAt\b/.test(field.attributes);
  if (isCreated && hasDefault) return null;
  if (isUpdated && (hasUpdatedAt || hasDefault)) return null;
  return {
    title: `Prisma: ${model.name}.${field.name} 타임스탬프 자동 설정 누락`,
    category: 'DATA_MODEL',
    severity: 'P2',
    confidence: 'HIGH',
    summary: `${model.name}.${field.name} (DateTime) 에 ${
      isCreated ? '@default(now())' : '@updatedAt'
    } 가 없습니다.`,
    nonDeveloperExplanation:
      '데이터가 언제 만들어졌고 언제 바뀌었는지가 자동으로 기록되지 않으면, 문제 추적이나 사용자 활동 분석이 어려워질 수 있습니다.',
    technicalExplanation: `R4 TIMESTAMP_MISSING: field ${model.name}.${field.name} is named like a timestamp but lacks ${
      isCreated ? '@default(now())' : '@updatedAt'
    }.`,
    impact: '애플리케이션 코드 누락 시 NULL 또는 잘못된 시간이 저장되어 감사로그/디버깅 불가.',
    recommendation: [
      '```prisma',
      isCreated
        ? `${field.name}  ${field.rawType}  @default(now())`
        : `${field.name}  ${field.rawType}  @updatedAt`,
      '```',
    ].join('\n'),
    acceptanceCriteria: [
      `${model.name}.${field.name} 에 ${
        isCreated ? '@default(now())' : '@updatedAt'
      } 어노테이션이 추가되었다.`,
    ],
    tags: ['prisma', 'data-model', 'R4_TIMESTAMP_MISSING'],
    evidences: [makeEvidence(schemaPath, field.line, field.line, field.raw)],
  };
}

function checkSensitiveField(
  model: ParsedModel,
  field: ModelField,
  schemaPath: string,
): NormalizedFinding | null {
  if (field.type !== 'String') return null;
  if (!SENSITIVE_NAME_RE.test(field.name)) return null;
  const hasLength = /@db\.(VarChar|Char)\s*\(/.test(field.attributes);
  const isText = /@db\.Text\b/.test(field.attributes);
  if (hasLength && !isText) return null;
  return {
    title: `Prisma: ${model.name}.${field.name} 민감 필드 저장 형식 점검 필요`,
    category: 'DATA_MODEL',
    severity: 'P0',
    confidence: 'MEDIUM',
    summary: `${model.name}.${field.name} 은 민감 정보로 보이지만 길이 제약이 없거나 @db.Text 로 저장됩니다. 평문 저장 여부 확인이 필요합니다.`,
    nonDeveloperExplanation:
      '비밀번호나 인증 토큰 같은 민감 정보는 원본 그대로(평문) 저장하면 안 되며, 안전하게 변환(해시/암호화)해서 저장해야 합니다. 현재 설정만으로는 그 보장이 되지 않습니다.',
    technicalExplanation: `R5 SENSITIVE_FIELD: field ${model.name}.${field.name} matches sensitive name pattern (${SENSITIVE_NAME_RE.source}) and has no length constraint / uses TEXT. Verify it is hashed (bcrypt/argon2) or encrypted at the application layer.`,
    impact: '평문 저장 시 DB 유출 한 번으로 모든 사용자 자격증명이 노출됩니다.',
    recommendation: [
      '1) 비밀번호는 bcrypt/argon2 해시값(보통 60~97자)을 저장하세요.',
      '2) 길이 제약을 명시하여 의도를 분명히 하세요.',
      '```prisma',
      `${field.name}  ${field.rawType}  @db.VarChar(255) // bcrypt hash`,
      '```',
      '3) 토큰류는 만료/회전 정책과 함께 별도 테이블 분리도 고려하세요.',
    ].join('\n'),
    acceptanceCriteria: [
      `${model.name}.${field.name} 이 해시/암호화된 형태로만 저장되며, 적절한 @db 어노테이션이 설정되었다.`,
    ],
    tags: ['prisma', 'data-model', 'R5_SENSITIVE_FIELD'],
    evidences: [makeEvidence(schemaPath, field.line, field.line, field.raw)],
  };
}

function checkForeignKeyConvention(
  model: ParsedModel,
  field: ModelField,
  schemaPath: string,
): NormalizedFinding | null {
  if (field.type !== 'String' && field.type !== 'Int' && field.type !== 'BigInt') return null;
  const fkMatch = FK_SUFFIX_RE.exec(field.name);
  if (!fkMatch) return null;
  if (field.name === 'id' || field.name === 'Id') return null;
  const base = fkMatch[1]!;
  if (!base) return null;
  const hasRelation = model.fields.some(
    (f) => f.name !== field.name && /@relation\b/.test(f.attributes) && f.attributes.includes(field.name),
  );
  if (hasRelation) return null;
  return {
    title: `Prisma: ${model.name}.${field.name} 외래키 컨벤션이지만 관계 정의 없음`,
    category: 'DATA_MODEL',
    severity: 'P1',
    confidence: 'MEDIUM',
    summary: `${model.name}.${field.name} 은 외래키 네이밍을 따르지만 @relation 으로 연결된 필드가 없습니다.`,
    nonDeveloperExplanation:
      '다른 데이터를 가리키는 값처럼 보이지만 실제로는 연결이 정의되지 않아, 잘못된 ID가 들어가도 시스템이 막지 못합니다. 데이터 무결성이 깨질 수 있습니다.',
    technicalExplanation: `R6 FK_NO_RELATION: field ${model.name}.${field.name} matches FK suffix convention but no @relation references it. Either rename or add a relation field.`,
    impact: 'DB 레벨 FOREIGN KEY 제약이 만들어지지 않아 orphan row 발생, JOIN 시 NULL 처리 누락.',
    recommendation: [
      '관계 필드를 추가하거나 단순 비-FK 컬럼이라면 명명을 바꾸세요.',
      '```prisma',
      `${field.name}  ${field.rawType}`,
      `${base}     ${base.charAt(0).toUpperCase() + base.slice(1)}  @relation(fields: [${field.name}], references: [id])`,
      '```',
    ].join('\n'),
    acceptanceCriteria: [
      `${model.name}.${field.name} 가 @relation 으로 명시적 외래키 관계를 가지거나, FK 가 아니라면 컬럼명이 바뀌었다.`,
    ],
    tags: ['prisma', 'data-model', 'R6_FK_NO_RELATION'],
    evidences: [makeEvidence(schemaPath, field.line, field.line, field.raw)],
  };
}

export async function analyzePrismaSchema(
  input: AnalyzePrismaInput,
): Promise<NormalizedFinding[]> {
  const reader = input.readFile ?? ((p: string) => fsp.readFile(p, 'utf8'));
  let source: string;
  try {
    source = await reader(input.schemaPath);
  } catch {
    return [];
  }
  if (!source || source.trim().length === 0) return [];

  const models = parseSchema(source);
  if (models.length === 0) return [];
  const modelsByName = new Map(models.map((m) => [m.name, m]));
  const findings: NormalizedFinding[] = [];

  for (const model of models) {
    const idFinding = checkMissingId(model, input.schemaPath);
    if (idFinding) findings.push(idFinding);
    for (const field of model.fields) {
      const r2 = checkStringLength(model, field, input.schemaPath);
      if (r2) findings.push(r2);
      const r3 = checkOneWayRelation(model, field, input.schemaPath, modelsByName);
      if (r3) findings.push(r3);
      const r4 = checkTimestamp(model, field, input.schemaPath);
      if (r4) findings.push(r4);
      const r5 = checkSensitiveField(model, field, input.schemaPath);
      if (r5) findings.push(r5);
      const r6 = checkForeignKeyConvention(model, field, input.schemaPath);
      if (r6) findings.push(r6);
    }
  }
  return findings;
}

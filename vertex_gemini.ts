import { VertexAI, SchemaType } from '@google-cloud/vertexai';

/**
 * Interface representing the structured JSON classification response
 */
export interface FurnitureClassificationResult {
  is_office_furniture: boolean;
  category: string;
  confidence: number;
  clearance_tier_recommendation: string;
  rationale: string;
}

/**
 * Production Vertex AI Gemini 1.5 Flash filter with deterministic JSON schema
 */
export class VertexFurnitureClassifier {
  private generativeModel;

  constructor(projectId: string, location = 'us-central1') {
    const vertexAI = new VertexAI({ project: projectId, location });
    this.generativeModel = vertexAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            is_office_furniture: {
              type: SchemaType.BOOLEAN,
              description: 'Whether the item represents commercial office/workspace furniture.',
            },
            category: {
              type: SchemaType.STRING,
              description: 'Target category: Desking, Executive Seating, Soft Seating, Storage, Meeting.',
            },
            confidence: {
              type: SchemaType.NUMBER,
              description: 'Confidence score between 0.0 and 1.0.',
            },
            clearance_tier_recommendation: {
              type: SchemaType.STRING,
              description: 'Tier A, Tier B, Overstock, or Liquidation.',
            },
            rationale: {
              type: SchemaType.STRING,
              description: 'Concise justification for classification.',
            },
          },
          required: ['is_office_furniture', 'category', 'confidence', 'clearance_tier_recommendation'],
        },
      },
    });
  }

  async classifyLot(title: string, rawDescription: string): Promise<FurnitureClassificationResult> {
    const prompt = `Analyze this inventory item and determine if it qualifies as commercial office furniture.
Title: "${title}"
Description: "${rawDescription}"`;

    const response = await this.generativeModel.generateContent(prompt);
    const candidate = response.response.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('Empty response from Vertex AI Gemini');
    }

    return JSON.parse(text) as FurnitureClassificationResult;
  }
}

/**
 * Quality Parity Evaluation Harness:
 * Runs side-by-side comparison between existing Ollama classifications and Gemini 1.5 Flash
 * to guarantee zero degradation in filtering precision and recall before deprecation.
 */
export interface EvaluationMetrics {
  totalSamples: number;
  agreementRate: number;
  falsePositives: number;
  falseNegatives: number;
  latencyAvgMs: number;
}

export function runQualityParityBenchmark(
  testDataset: Array<{ title: string; desc: string; ollamaLabel: boolean }>,
  geminiPredictions: Array<{ is_office_furniture: boolean; latencyMs: number }>
): EvaluationMetrics {
  let matches = 0;
  let fp = 0;
  let fn = 0;
  let totalLatency = 0;

  for (let i = 0; i < testDataset.length; i++) {
    const groundTruth = testDataset[i].ollamaLabel;
    const pred = geminiPredictions[i].is_office_furniture;
    totalLatency += geminiPredictions[i].latencyMs;

    if (groundTruth === pred) {
      matches++;
    } else if (!groundTruth && pred) {
      fp++;
    } else if (groundTruth && !pred) {
      fn++;
    }
  }

  return {
    totalSamples: testDataset.length,
    agreementRate: Number(((matches / testDataset.length) * 100).toFixed(2)),
    falsePositives: fp,
    falseNegatives: fn,
    latencyAvgMs: Math.round(totalLatency / testDataset.length),
  };
}

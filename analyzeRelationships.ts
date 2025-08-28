// analyzeRelationships.ts
import {createClient} from '@sanity/client'
import {schemaTypes} from './schemaTypes'

const client = createClient({
  projectId: 'lhmeratw', // Replace with your project ID
  dataset: 'production', // or your dataset name
  useCdn: false,
  apiVersion: '2023-05-03',
})

interface RelationshipInfo {
  fieldName: string
  fieldType: string
  targetType?: string
  isArray: boolean
  isReference: boolean
  isAsset: boolean
}

interface SchemaAnalysis {
  typeName: string
  relationships: RelationshipInfo[]
  documentCount: number
}

async function analyzeRelationships() {
  console.log('Analyzing Content Relationships:')
  console.log('================================\n')

  try {
    const analysisResults: SchemaAnalysis[] = []

    // Analyze each schema type
    for (const schema of schemaTypes) {
      const analysis = await analyzeSchemaType(schema)
      analysisResults.push(analysis)
    }

    // Generate relationship report
    generateRelationshipReport(analysisResults)

    // Sample content analysis
    await sampleContentAnalysis(analysisResults)
  } catch (error) {
    console.error('Error analyzing relationships:', error)
  }
}

async function analyzeSchemaType(schema: any): Promise<SchemaAnalysis> {
  const relationships: RelationshipInfo[] = []

  // Only analyze document types (not objects or other types)
  if (schema.type !== 'document') {
    return {
      typeName: schema.name,
      relationships: [],
      documentCount: 0,
    }
  }

  // Get document count
  const documentCount = await client.fetch(`count(*[_type == "${schema.name}"])`)

  // Analyze fields if they exist
  if ('fields' in schema && schema.fields) {
    schema.fields.forEach((field: any) => {
      const relationshipInfo = analyzeField(field)
      if (relationshipInfo) {
        relationships.push(relationshipInfo)
      }
    })
  }

  return {
    typeName: schema.name,
    relationships,
    documentCount,
  }
}

function analyzeField(field: any): RelationshipInfo | null {
  const fieldAny = field as any
  let relationshipInfo: RelationshipInfo | null = null

  // Check for references
  if (field.type === 'reference') {
    relationshipInfo = {
      fieldName: field.name,
      fieldType: 'reference',
      targetType: fieldAny.to?.[0]?.type || 'unknown',
      isArray: false,
      isReference: true,
      isAsset: false,
    }
  }
  // Check for arrays (might contain references or assets)
  else if (field.type === 'array') {
    const arrayItemType = fieldAny.of?.[0]
    if (arrayItemType?.type === 'reference') {
      relationshipInfo = {
        fieldName: field.name,
        fieldType: 'array of references',
        targetType: arrayItemType.to?.[0]?.type || 'unknown',
        isArray: true,
        isReference: true,
        isAsset: false,
      }
    } else if (arrayItemType?.type === 'image' || arrayItemType?.type === 'file') {
      relationshipInfo = {
        fieldName: field.name,
        fieldType: `array of ${arrayItemType.type}`,
        isArray: true,
        isReference: false,
        isAsset: true,
      }
    }
  }
  // Check for single assets
  else if (field.type === 'image' || field.type === 'file') {
    relationshipInfo = {
      fieldName: field.name,
      fieldType: field.type,
      isArray: false,
      isReference: false,
      isAsset: true,
    }
  }
  // Check for objects that might contain nested assets or references
  else if (field.type === 'object') {
    const nestedFields = fieldAny.fields || []
    const hasNestedAssets = nestedFields.some((f: any) => f.type === 'image' || f.type === 'file')
    const hasNestedReferences = nestedFields.some((f: any) => f.type === 'reference')

    if (hasNestedAssets || hasNestedReferences) {
      relationshipInfo = {
        fieldName: field.name,
        fieldType: 'object with nested relationships',
        isArray: false,
        isReference: hasNestedReferences,
        isAsset: hasNestedAssets,
      }
    }
  }

  return relationshipInfo
}

function generateRelationshipReport(analyses: SchemaAnalysis[]) {
  console.log('RELATIONSHIP MAPPING SUMMARY:')
  console.log('=============================\n')

  analyses.forEach((analysis) => {
    if (analysis.relationships.length === 0 && analysis.documentCount === 0) return

    console.log(`📋 ${analysis.typeName.toUpperCase()} (${analysis.documentCount} documents)`)
    console.log('─'.repeat(50))

    if (analysis.relationships.length === 0) {
      console.log('  No relationships found')
    } else {
      analysis.relationships.forEach((rel) => {
        let description = `  ${rel.fieldName}: ${rel.fieldType}`
        if (rel.targetType) {
          description += ` → ${rel.targetType}`
        }
        if (rel.isArray) {
          description += ' (multiple)'
        }
        console.log(description)
      })
    }
    console.log('')
  })

  // Summary statistics
  const totalDocuments = analyses.reduce((sum, a) => sum + a.documentCount, 0)
  const typesWithRelationships = analyses.filter((a) => a.relationships.length > 0).length
  const totalRelationships = analyses.reduce((sum, a) => sum + a.relationships.length, 0)

  console.log('MIGRATION PLANNING SUMMARY:')
  console.log('===========================')
  console.log(`Total document types: ${analyses.length}`)
  console.log(`Total documents: ${totalDocuments}`)
  console.log(`Types with relationships: ${typesWithRelationships}`)
  console.log(`Total relationship fields: ${totalRelationships}`)
  console.log('')
}

async function sampleContentAnalysis(analyses: SchemaAnalysis[]) {
  console.log('SAMPLE CONTENT ANALYSIS:')
  console.log('========================\n')

  for (const analysis of analyses) {
    if (analysis.documentCount === 0 || analysis.relationships.length === 0) continue

    console.log(`Sampling ${analysis.typeName} content...`)

    try {
      // Build a query to fetch sample documents with their relationships
      const relationshipFields = analysis.relationships
        .map((rel) => {
          if (rel.isReference && rel.isArray) {
            return `${rel.fieldName}[]->{ _id, _type }`
          } else if (rel.isReference) {
            return `${rel.fieldName}->{ _id, _type }`
          } else if (rel.isAsset) {
            return rel.fieldName
          } else {
            return rel.fieldName
          }
        })
        .join(',\n    ')

      const query = `*[_type == "${analysis.typeName}"][0...3]{
        _id,
        _type,
        ${relationshipFields}
      }`

      const sampleDocs = await client.fetch(query)

      sampleDocs.forEach((doc: any, index: number) => {
        console.log(`  Sample ${index + 1}:`)

        analysis.relationships.forEach((rel) => {
          const value = doc[rel.fieldName]
          let display = 'None'

          if (value) {
            if (rel.isReference && Array.isArray(value)) {
              display = `${value.length} references`
            } else if (rel.isReference && value._type) {
              display = `1 reference to ${value._type}`
            } else if (rel.isAsset && Array.isArray(value)) {
              display = `${value.length} assets`
            } else if (rel.isAsset) {
              display = '1 asset'
            } else {
              display = 'Has data'
            }
          }

          console.log(`    ${rel.fieldName}: ${display}`)
        })
        console.log('')
      })
    } catch (error) {
      console.log(`    Error sampling ${analysis.typeName}:`, error)
    }
  }
}

// Run the analysis
analyzeRelationships()

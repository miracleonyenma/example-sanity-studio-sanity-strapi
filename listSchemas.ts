// listSchemas.ts
import {createClient} from '@sanity/client'
import {schemaTypes} from './schemaTypes'

// Optional: If you want to analyze the actual data too
const client = createClient({
  projectId: 'lhmeratw', // Replace with your project ID
  dataset: 'production', // or your dataset name
  useCdn: false,
  apiVersion: '2023-05-03',
})

console.log('Schema Analysis:')
console.log('================')

schemaTypes.forEach((schema) => {
  console.log(`\nSchema: ${schema.name}`)
  console.log(`Type: ${schema.type}`)

  if ('fields' in schema && schema.fields) {
    console.log('Fields:')
    schema.fields.forEach((field) => {
      console.log(`  - ${field.name}: ${field.type}`)

      // Type-safe property access
      const fieldAny = field as any

      if (fieldAny.of) {
        console.log(`    of: ${JSON.stringify(fieldAny.of, null, 4)}`)
      }
      if (fieldAny.to) {
        console.log(`    to: ${JSON.stringify(fieldAny.to, null, 4)}`)
      }
      if (fieldAny.options) {
        console.log(`    options: ${JSON.stringify(fieldAny.options, null, 4)}`)
      }
    })
  }
})

// Optional: Get document counts
async function getDocumentCounts() {
  console.log('\nDocument Counts:')
  console.log('================')

  for (const schema of schemaTypes) {
    try {
      const count = await client.fetch(`count(*[_type == "${schema.name}"])`)
      console.log(`${schema.name}: ${count} documents`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.log(`${schema.name}: Error getting count - ${errorMessage}`)
    }
  }
}

// Uncomment the line below if you want document counts too
getDocumentCounts()

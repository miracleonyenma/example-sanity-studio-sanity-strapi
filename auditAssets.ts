// ./auditAssets.ts
import {createClient} from '@sanity/client'

const client = createClient({
  projectId: 'lhmeratw', // Gets from your sanity.config.ts
  dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  useCdn: false,
  apiVersion: '2023-05-03',
  token: process.env.SANITY_API_TOKEN, // Will use the token from --with-user-token
})

interface AssetInfo {
  _id: string
  _type: string
  url: string
  originalFilename: string
  size: number
  mimeType: string
  extension: string
  metadata?: {
    dimensions?: {
      width: number
      height: number
    }
  }
}

interface AssetUsage {
  assetId: string
  usedInDocuments: Array<{
    documentId: string
    documentType: string
    fieldPath: string
  }>
  totalReferences: number
}

async function auditAssets() {
  console.log('Starting asset audit...')
  console.log('========================\n')

  try {
    // Get all assets
    const assets = await client.fetch<AssetInfo[]>(`
      *[_type in ["sanity.imageAsset", "sanity.fileAsset"]] {
        _id,
        _type,
        url,
        originalFilename,
        size,
        mimeType,
        extension,
        metadata
      }
    `)

    console.log(`Found ${assets.length} total assets\n`)

    // Categorize assets
    const imageAssets = assets.filter((asset) => asset._type === 'sanity.imageAsset')
    const fileAssets = assets.filter((asset) => asset._type === 'sanity.fileAsset')

    console.log('ASSET BREAKDOWN:')
    console.log('================')
    console.log(`Images: ${imageAssets.length}`)
    console.log(`Files: ${fileAssets.length}`)

    // Calculate total size
    const totalSize = assets.reduce((sum, asset) => sum + (asset.size || 0), 0)
    const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2)
    console.log(`Total size: ${totalSizeMB} MB\n`)

    // Analyze image dimensions
    if (imageAssets.length > 0) {
      console.log('IMAGE ANALYSIS:')
      console.log('===============')

      const withDimensions = imageAssets.filter((img) => img.metadata?.dimensions)
      const avgWidth =
        withDimensions.reduce((sum, img) => sum + (img.metadata?.dimensions?.width || 0), 0) /
        withDimensions.length
      const avgHeight =
        withDimensions.reduce((sum, img) => sum + (img.metadata?.dimensions?.height || 0), 0) /
        withDimensions.length

      console.log(`Images with dimensions: ${withDimensions.length}/${imageAssets.length}`)
      if (withDimensions.length > 0) {
        console.log(`Average dimensions: ${Math.round(avgWidth)}x${Math.round(avgHeight)}`)
      }

      // Group by file type
      const imageTypes = imageAssets.reduce(
        (acc, img) => {
          const type = img.mimeType || 'unknown'
          acc[type] = (acc[type] || 0) + 1
          return acc
        },
        {} as Record<string, number>,
      )

      console.log('Image types:')
      Object.entries(imageTypes).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`)
      })
      console.log('')
    }

    // Analyze file types
    if (fileAssets.length > 0) {
      console.log('FILE ANALYSIS:')
      console.log('==============')

      const fileTypes = fileAssets.reduce(
        (acc, file) => {
          const type = file.mimeType || 'unknown'
          acc[type] = (acc[type] || 0) + 1
          return acc
        },
        {} as Record<string, number>,
      )

      console.log('File types:')
      Object.entries(fileTypes).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`)
      })
      console.log('')
    }

    // Find asset usage
    console.log('ASSET USAGE ANALYSIS:')
    console.log('=====================')
    await analyzeAssetUsage(assets)

    // Generate asset inventory
    await generateAssetInventory(assets)

    console.log('Asset audit complete!')
  } catch (error) {
    console.error('Error during asset audit:', error)
  }
}

async function analyzeAssetUsage(assets: AssetInfo[]) {
  const usageMap = new Map<string, AssetUsage>()

  // Initialize usage tracking for all assets
  assets.forEach((asset) => {
    usageMap.set(asset._id, {
      assetId: asset._id,
      usedInDocuments: [],
      totalReferences: 0,
    })
  })

  // We use the references() function instead of trying to parse document structure
  let unusedAssets = 0
  let usedAssets = 0

  for (const asset of assets) {
    // Check if asset is referenced in any document
    const referencingDocs = await client.fetch(`
      *[references("${asset._id}")] {
        _id,
        _type
      }
    `)

    if (referencingDocs.length > 0) {
      usedAssets++
      const usage = usageMap.get(asset._id)!
      usage.totalReferences = referencingDocs.length
      usage.usedInDocuments = referencingDocs.map(
        (doc: {_id: string; _type: string; [key: string]: any}) => ({
          documentId: doc._id,
          documentType: doc._type,
          fieldPath: 'unknown', // Would need deeper analysis to determine exact field
        }),
      )
    } else {
      unusedAssets++
    }
  }

  console.log(`Used assets: ${usedAssets}`)
  console.log(`Unused assets: ${unusedAssets}`)

  // Show some examples of heavily used assets
  const sortedByUsage = Array.from(usageMap.values()).sort(
    (a, b) => b.totalReferences - a.totalReferences,
  )
  const topUsed = sortedByUsage.slice(0, 5).filter((usage) => usage.totalReferences > 0)

  if (topUsed.length > 0) {
    console.log('\nMost referenced assets:')
    topUsed.forEach((usage) => {
      const asset = assets.find((a) => a._id === usage.assetId)
      console.log(`  ${asset?.originalFilename || 'Unknown'}: ${usage.totalReferences} references`)
    })
  }

  console.log('')
}

async function generateAssetInventory(assets: AssetInfo[]) {
  const inventory = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalAssets: assets.length,
      totalImages: assets.filter((a) => a._type === 'sanity.imageAsset').length,
      totalFiles: assets.filter((a) => a._type === 'sanity.fileAsset').length,
      totalSizeBytes: assets.reduce((sum, asset) => sum + (asset.size || 0), 0),
    },
    assets: assets.map((asset) => ({
      id: asset._id,
      type: asset._type,
      filename: asset.originalFilename,
      url: asset.url,
      size: asset.size,
      mimeType: asset.mimeType,
      extension: asset.extension,
      dimensions: asset.metadata?.dimensions,
    })),
  }

  // Write to file
  const fs = require('fs')
  fs.writeFileSync('assets-inventory.json', JSON.stringify(inventory, null, 2))
  console.log('Asset inventory saved to assets-inventory.json')
}

// Export the assets to a local directory (optional)
async function exportAssets() {
  console.log('\nTo export assets, you can use the Sanity CLI:')
  console.log('sanity dataset export production --assets-only assets-export/')
  console.log('Or export everything including assets:')
  console.log('sanity dataset export production full-export-with-assets/')
}

// Run the audit
auditAssets().then(() => {
  exportAssets()
})

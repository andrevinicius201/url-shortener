import fastify from 'fastify'
import { z } from 'zod'
import { sql } from './lib/postgres'
import postgres from 'postgres'
import { redis } from './lib/redis'

const app = fastify()

app.get('/:code', async(request, reply) => {
    const getLinkSchema = z.object({
        code: z.string().min(3)
    })

    const { code } = getLinkSchema.parse(request.params)
    const result = await sql `SELECT id, original_url FROM short_links WHERE short_links.code = ${code}`
    const link = result[0]

    if(result.length == 0){
        return reply.status(400).send({message:"Link not found"})
    }

    console.log(link.id)
    await redis.zIncrBy('metrics', 1, String(link.id))

    return reply.redirect(301, link.original_url)
})

app.get('/api/links', async () => {
    const result = await sql `SELECT * FROM short_links ORDER BY created_at DESC`
    return result
})
 
app.post('/api/links', async (request, reply) => {
    
    const createLinkSchema = z.object({
        code: z.string().min(3),
        url: z.string().url()
    })

    const {code, url} = createLinkSchema.parse(request.body)

    try {
        const result = await sql `INSERT INTO short_links (code, original_url) values (${code}, ${url}) RETURNING id`
        console.log("inserido com sucesso")
        const link = result[0]
        return reply.status(201).send({ shortLinkId:link.id })

    } catch(err){
        if(err instanceof postgres.PostgresError){
            if(err.code == "23505"){
                return reply.status(400).send({message: "Este código já está sendo utilizado"})
            }
        }
        console.log(err)
        return reply.status(500).send({message: "Erro desconhecido... Por favor, tente novamente mais tarde"})
    }


})

app.get('/metrics', async () => {
    const result = await redis.zRangeByScoreWithScores('metrics', 0, 50)
    const metrics = result
        .sort((a, b) => b.score - a.score)
        .map(item => {
            return {
                shortLinkid: Number(item.value),
                clicks: Number(item.score)
            }
        })
    return metrics
})

app.listen({
    port:3333
}).then(() => {
    console.log("Servidor HTTP iniciado com sucesso")
})


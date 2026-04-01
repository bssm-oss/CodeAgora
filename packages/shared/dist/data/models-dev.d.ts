/**
 * models.dev Integration Layer
 *
 * Fetches, caches, and queries the models.dev catalog for CodeAgora's
 * supported providers. Provides a 3-tier loading strategy:
 *   1. Local cache (~/.config/codeagora/models-dev-cache.json) if < 60 min old
 *   2. Live fetch from https://models.dev/api.json (filtered to supported providers)
 *   3. Bundled snapshot fallback (packages/shared/src/data/models-dev-snapshot.json)
 */
import { z } from 'zod';
export declare const ModelEntrySchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    family: z.ZodOptional<z.ZodString>;
    reasoning: z.ZodBoolean;
    tool_call: z.ZodBoolean;
    cost: z.ZodOptional<z.ZodObject<{
        input: z.ZodNumber;
        output: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        input: number;
        output: number;
    }, {
        input: number;
        output: number;
    }>>;
    limit: z.ZodObject<{
        context: z.ZodNumber;
        output: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        output: number;
        context: number;
    }, {
        output: number;
        context: number;
    }>;
    release_date: z.ZodString;
    modalities: z.ZodObject<{
        input: z.ZodArray<z.ZodString, "many">;
        output: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        input: string[];
        output: string[];
    }, {
        input: string[];
        output: string[];
    }>;
    open_weights: z.ZodBoolean;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodString;
    name: z.ZodString;
    family: z.ZodOptional<z.ZodString>;
    reasoning: z.ZodBoolean;
    tool_call: z.ZodBoolean;
    cost: z.ZodOptional<z.ZodObject<{
        input: z.ZodNumber;
        output: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        input: number;
        output: number;
    }, {
        input: number;
        output: number;
    }>>;
    limit: z.ZodObject<{
        context: z.ZodNumber;
        output: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        output: number;
        context: number;
    }, {
        output: number;
        context: number;
    }>;
    release_date: z.ZodString;
    modalities: z.ZodObject<{
        input: z.ZodArray<z.ZodString, "many">;
        output: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        input: string[];
        output: string[];
    }, {
        input: string[];
        output: string[];
    }>;
    open_weights: z.ZodBoolean;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodString;
    name: z.ZodString;
    family: z.ZodOptional<z.ZodString>;
    reasoning: z.ZodBoolean;
    tool_call: z.ZodBoolean;
    cost: z.ZodOptional<z.ZodObject<{
        input: z.ZodNumber;
        output: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        input: number;
        output: number;
    }, {
        input: number;
        output: number;
    }>>;
    limit: z.ZodObject<{
        context: z.ZodNumber;
        output: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        output: number;
        context: number;
    }, {
        output: number;
        context: number;
    }>;
    release_date: z.ZodString;
    modalities: z.ZodObject<{
        input: z.ZodArray<z.ZodString, "many">;
        output: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        input: string[];
        output: string[];
    }, {
        input: string[];
        output: string[];
    }>;
    open_weights: z.ZodBoolean;
}, z.ZodTypeAny, "passthrough">>;
export declare const ProviderEntrySchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    env: z.ZodArray<z.ZodString, "many">;
    npm: z.ZodString;
    api: z.ZodOptional<z.ZodString>;
    doc: z.ZodString;
    models: z.ZodRecord<z.ZodString, z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        family: z.ZodOptional<z.ZodString>;
        reasoning: z.ZodBoolean;
        tool_call: z.ZodBoolean;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
        }, {
            input: number;
            output: number;
        }>>;
        limit: z.ZodObject<{
            context: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            output: number;
            context: number;
        }, {
            output: number;
            context: number;
        }>;
        release_date: z.ZodString;
        modalities: z.ZodObject<{
            input: z.ZodArray<z.ZodString, "many">;
            output: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            input: string[];
            output: string[];
        }, {
            input: string[];
            output: string[];
        }>;
        open_weights: z.ZodBoolean;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        id: z.ZodString;
        name: z.ZodString;
        family: z.ZodOptional<z.ZodString>;
        reasoning: z.ZodBoolean;
        tool_call: z.ZodBoolean;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
        }, {
            input: number;
            output: number;
        }>>;
        limit: z.ZodObject<{
            context: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            output: number;
            context: number;
        }, {
            output: number;
            context: number;
        }>;
        release_date: z.ZodString;
        modalities: z.ZodObject<{
            input: z.ZodArray<z.ZodString, "many">;
            output: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            input: string[];
            output: string[];
        }, {
            input: string[];
            output: string[];
        }>;
        open_weights: z.ZodBoolean;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        id: z.ZodString;
        name: z.ZodString;
        family: z.ZodOptional<z.ZodString>;
        reasoning: z.ZodBoolean;
        tool_call: z.ZodBoolean;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
        }, {
            input: number;
            output: number;
        }>>;
        limit: z.ZodObject<{
            context: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            output: number;
            context: number;
        }, {
            output: number;
            context: number;
        }>;
        release_date: z.ZodString;
        modalities: z.ZodObject<{
            input: z.ZodArray<z.ZodString, "many">;
            output: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            input: string[];
            output: string[];
        }, {
            input: string[];
            output: string[];
        }>;
        open_weights: z.ZodBoolean;
    }, z.ZodTypeAny, "passthrough">>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodString;
    name: z.ZodString;
    env: z.ZodArray<z.ZodString, "many">;
    npm: z.ZodString;
    api: z.ZodOptional<z.ZodString>;
    doc: z.ZodString;
    models: z.ZodRecord<z.ZodString, z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        family: z.ZodOptional<z.ZodString>;
        reasoning: z.ZodBoolean;
        tool_call: z.ZodBoolean;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
        }, {
            input: number;
            output: number;
        }>>;
        limit: z.ZodObject<{
            context: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            output: number;
            context: number;
        }, {
            output: number;
            context: number;
        }>;
        release_date: z.ZodString;
        modalities: z.ZodObject<{
            input: z.ZodArray<z.ZodString, "many">;
            output: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            input: string[];
            output: string[];
        }, {
            input: string[];
            output: string[];
        }>;
        open_weights: z.ZodBoolean;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        id: z.ZodString;
        name: z.ZodString;
        family: z.ZodOptional<z.ZodString>;
        reasoning: z.ZodBoolean;
        tool_call: z.ZodBoolean;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
        }, {
            input: number;
            output: number;
        }>>;
        limit: z.ZodObject<{
            context: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            output: number;
            context: number;
        }, {
            output: number;
            context: number;
        }>;
        release_date: z.ZodString;
        modalities: z.ZodObject<{
            input: z.ZodArray<z.ZodString, "many">;
            output: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            input: string[];
            output: string[];
        }, {
            input: string[];
            output: string[];
        }>;
        open_weights: z.ZodBoolean;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        id: z.ZodString;
        name: z.ZodString;
        family: z.ZodOptional<z.ZodString>;
        reasoning: z.ZodBoolean;
        tool_call: z.ZodBoolean;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
        }, {
            input: number;
            output: number;
        }>>;
        limit: z.ZodObject<{
            context: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            output: number;
            context: number;
        }, {
            output: number;
            context: number;
        }>;
        release_date: z.ZodString;
        modalities: z.ZodObject<{
            input: z.ZodArray<z.ZodString, "many">;
            output: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            input: string[];
            output: string[];
        }, {
            input: string[];
            output: string[];
        }>;
        open_weights: z.ZodBoolean;
    }, z.ZodTypeAny, "passthrough">>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodString;
    name: z.ZodString;
    env: z.ZodArray<z.ZodString, "many">;
    npm: z.ZodString;
    api: z.ZodOptional<z.ZodString>;
    doc: z.ZodString;
    models: z.ZodRecord<z.ZodString, z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        family: z.ZodOptional<z.ZodString>;
        reasoning: z.ZodBoolean;
        tool_call: z.ZodBoolean;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
        }, {
            input: number;
            output: number;
        }>>;
        limit: z.ZodObject<{
            context: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            output: number;
            context: number;
        }, {
            output: number;
            context: number;
        }>;
        release_date: z.ZodString;
        modalities: z.ZodObject<{
            input: z.ZodArray<z.ZodString, "many">;
            output: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            input: string[];
            output: string[];
        }, {
            input: string[];
            output: string[];
        }>;
        open_weights: z.ZodBoolean;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        id: z.ZodString;
        name: z.ZodString;
        family: z.ZodOptional<z.ZodString>;
        reasoning: z.ZodBoolean;
        tool_call: z.ZodBoolean;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
        }, {
            input: number;
            output: number;
        }>>;
        limit: z.ZodObject<{
            context: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            output: number;
            context: number;
        }, {
            output: number;
            context: number;
        }>;
        release_date: z.ZodString;
        modalities: z.ZodObject<{
            input: z.ZodArray<z.ZodString, "many">;
            output: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            input: string[];
            output: string[];
        }, {
            input: string[];
            output: string[];
        }>;
        open_weights: z.ZodBoolean;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        id: z.ZodString;
        name: z.ZodString;
        family: z.ZodOptional<z.ZodString>;
        reasoning: z.ZodBoolean;
        tool_call: z.ZodBoolean;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
        }, {
            input: number;
            output: number;
        }>>;
        limit: z.ZodObject<{
            context: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            output: number;
            context: number;
        }, {
            output: number;
            context: number;
        }>;
        release_date: z.ZodString;
        modalities: z.ZodObject<{
            input: z.ZodArray<z.ZodString, "many">;
            output: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            input: string[];
            output: string[];
        }, {
            input: string[];
            output: string[];
        }>;
        open_weights: z.ZodBoolean;
    }, z.ZodTypeAny, "passthrough">>>;
}, z.ZodTypeAny, "passthrough">>;
export declare const ModelsCatalogSchema: z.ZodRecord<z.ZodString, z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    env: z.ZodArray<z.ZodString, "many">;
    npm: z.ZodString;
    api: z.ZodOptional<z.ZodString>;
    doc: z.ZodString;
    models: z.ZodRecord<z.ZodString, z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        family: z.ZodOptional<z.ZodString>;
        reasoning: z.ZodBoolean;
        tool_call: z.ZodBoolean;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
        }, {
            input: number;
            output: number;
        }>>;
        limit: z.ZodObject<{
            context: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            output: number;
            context: number;
        }, {
            output: number;
            context: number;
        }>;
        release_date: z.ZodString;
        modalities: z.ZodObject<{
            input: z.ZodArray<z.ZodString, "many">;
            output: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            input: string[];
            output: string[];
        }, {
            input: string[];
            output: string[];
        }>;
        open_weights: z.ZodBoolean;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        id: z.ZodString;
        name: z.ZodString;
        family: z.ZodOptional<z.ZodString>;
        reasoning: z.ZodBoolean;
        tool_call: z.ZodBoolean;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
        }, {
            input: number;
            output: number;
        }>>;
        limit: z.ZodObject<{
            context: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            output: number;
            context: number;
        }, {
            output: number;
            context: number;
        }>;
        release_date: z.ZodString;
        modalities: z.ZodObject<{
            input: z.ZodArray<z.ZodString, "many">;
            output: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            input: string[];
            output: string[];
        }, {
            input: string[];
            output: string[];
        }>;
        open_weights: z.ZodBoolean;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        id: z.ZodString;
        name: z.ZodString;
        family: z.ZodOptional<z.ZodString>;
        reasoning: z.ZodBoolean;
        tool_call: z.ZodBoolean;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
        }, {
            input: number;
            output: number;
        }>>;
        limit: z.ZodObject<{
            context: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            output: number;
            context: number;
        }, {
            output: number;
            context: number;
        }>;
        release_date: z.ZodString;
        modalities: z.ZodObject<{
            input: z.ZodArray<z.ZodString, "many">;
            output: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            input: string[];
            output: string[];
        }, {
            input: string[];
            output: string[];
        }>;
        open_weights: z.ZodBoolean;
    }, z.ZodTypeAny, "passthrough">>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodString;
    name: z.ZodString;
    env: z.ZodArray<z.ZodString, "many">;
    npm: z.ZodString;
    api: z.ZodOptional<z.ZodString>;
    doc: z.ZodString;
    models: z.ZodRecord<z.ZodString, z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        family: z.ZodOptional<z.ZodString>;
        reasoning: z.ZodBoolean;
        tool_call: z.ZodBoolean;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
        }, {
            input: number;
            output: number;
        }>>;
        limit: z.ZodObject<{
            context: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            output: number;
            context: number;
        }, {
            output: number;
            context: number;
        }>;
        release_date: z.ZodString;
        modalities: z.ZodObject<{
            input: z.ZodArray<z.ZodString, "many">;
            output: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            input: string[];
            output: string[];
        }, {
            input: string[];
            output: string[];
        }>;
        open_weights: z.ZodBoolean;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        id: z.ZodString;
        name: z.ZodString;
        family: z.ZodOptional<z.ZodString>;
        reasoning: z.ZodBoolean;
        tool_call: z.ZodBoolean;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
        }, {
            input: number;
            output: number;
        }>>;
        limit: z.ZodObject<{
            context: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            output: number;
            context: number;
        }, {
            output: number;
            context: number;
        }>;
        release_date: z.ZodString;
        modalities: z.ZodObject<{
            input: z.ZodArray<z.ZodString, "many">;
            output: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            input: string[];
            output: string[];
        }, {
            input: string[];
            output: string[];
        }>;
        open_weights: z.ZodBoolean;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        id: z.ZodString;
        name: z.ZodString;
        family: z.ZodOptional<z.ZodString>;
        reasoning: z.ZodBoolean;
        tool_call: z.ZodBoolean;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
        }, {
            input: number;
            output: number;
        }>>;
        limit: z.ZodObject<{
            context: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            output: number;
            context: number;
        }, {
            output: number;
            context: number;
        }>;
        release_date: z.ZodString;
        modalities: z.ZodObject<{
            input: z.ZodArray<z.ZodString, "many">;
            output: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            input: string[];
            output: string[];
        }, {
            input: string[];
            output: string[];
        }>;
        open_weights: z.ZodBoolean;
    }, z.ZodTypeAny, "passthrough">>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodString;
    name: z.ZodString;
    env: z.ZodArray<z.ZodString, "many">;
    npm: z.ZodString;
    api: z.ZodOptional<z.ZodString>;
    doc: z.ZodString;
    models: z.ZodRecord<z.ZodString, z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        family: z.ZodOptional<z.ZodString>;
        reasoning: z.ZodBoolean;
        tool_call: z.ZodBoolean;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
        }, {
            input: number;
            output: number;
        }>>;
        limit: z.ZodObject<{
            context: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            output: number;
            context: number;
        }, {
            output: number;
            context: number;
        }>;
        release_date: z.ZodString;
        modalities: z.ZodObject<{
            input: z.ZodArray<z.ZodString, "many">;
            output: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            input: string[];
            output: string[];
        }, {
            input: string[];
            output: string[];
        }>;
        open_weights: z.ZodBoolean;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        id: z.ZodString;
        name: z.ZodString;
        family: z.ZodOptional<z.ZodString>;
        reasoning: z.ZodBoolean;
        tool_call: z.ZodBoolean;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
        }, {
            input: number;
            output: number;
        }>>;
        limit: z.ZodObject<{
            context: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            output: number;
            context: number;
        }, {
            output: number;
            context: number;
        }>;
        release_date: z.ZodString;
        modalities: z.ZodObject<{
            input: z.ZodArray<z.ZodString, "many">;
            output: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            input: string[];
            output: string[];
        }, {
            input: string[];
            output: string[];
        }>;
        open_weights: z.ZodBoolean;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        id: z.ZodString;
        name: z.ZodString;
        family: z.ZodOptional<z.ZodString>;
        reasoning: z.ZodBoolean;
        tool_call: z.ZodBoolean;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
        }, {
            input: number;
            output: number;
        }>>;
        limit: z.ZodObject<{
            context: z.ZodNumber;
            output: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            output: number;
            context: number;
        }, {
            output: number;
            context: number;
        }>;
        release_date: z.ZodString;
        modalities: z.ZodObject<{
            input: z.ZodArray<z.ZodString, "many">;
            output: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            input: string[];
            output: string[];
        }, {
            input: string[];
            output: string[];
        }>;
        open_weights: z.ZodBoolean;
    }, z.ZodTypeAny, "passthrough">>>;
}, z.ZodTypeAny, "passthrough">>>;
export type ModelEntry = z.infer<typeof ModelEntrySchema>;
export type ProviderEntry = z.infer<typeof ProviderEntrySchema>;
export type ModelsCatalog = z.infer<typeof ModelsCatalogSchema>;
/** Maps CodeAgora provider IDs to models.dev provider IDs (only where they differ). */
export declare const PROVIDER_ID_MAP: Record<string, string>;
/** Convert a CodeAgora provider ID to its models.dev equivalent. */
export declare function toModelsDevId(caId: string): string;
/** Convert a models.dev provider ID to its CodeAgora equivalent. */
export declare function fromModelsDevId(mdId: string): string;
/** All CodeAgora provider IDs (from the env-vars source of truth). */
export declare const SUPPORTED_PROVIDER_IDS: string[];
/** The corresponding models.dev IDs for all supported providers. */
export declare const SUPPORTED_MODELS_DEV_IDS: string[];
/**
 * Load the models.dev catalog with a 3-tier strategy:
 *   1. Local cache if fresh (< 60 min)
 *   2. Live API fetch → save to cache
 *   3. Expired cache or bundled snapshot as fallback
 */
export declare function loadModelsCatalog(): Promise<ModelsCatalog>;
/**
 * Filter models capable of performing code review:
 *   - tool_call === true
 *   - context window >= 16,000 tokens
 *   - accepts text input
 */
export declare function filterReviewCapable(models: ModelEntry[]): ModelEntry[];
/** Filter models with zero cost (free tier). */
export declare function filterFree(models: ModelEntry[]): ModelEntry[];
/** Sort models by total cost (input + output) ascending. Models without cost come first. */
export declare function sortByCost(models: ModelEntry[]): ModelEntry[];
/**
 * Get the top N review-capable models from a provider, sorted by cost.
 * @param catalog - The loaded models catalog
 * @param providerId - CodeAgora provider ID (e.g. "groq", "nvidia-nim")
 * @param n - Maximum number of models to return
 */
export declare function getTopModels(catalog: ModelsCatalog, providerId: string, n: number): ModelEntry[];
/**
 * Get statistics about a provider's models.
 * @param catalog - The loaded models catalog
 * @param providerId - CodeAgora provider ID (e.g. "groq", "nvidia-nim")
 */
export declare function getProviderStats(catalog: ModelsCatalog, providerId: string): {
    total: number;
    free: number;
    reviewCapable: number;
};
//# sourceMappingURL=models-dev.d.ts.map
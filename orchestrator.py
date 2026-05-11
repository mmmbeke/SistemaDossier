import os
from openai import OpenAI
from dotenv import load_dotenv

# Cargamos las llaves desde el .env
load_dotenv()

# Inicializamos el cliente de OpenAI
# Asegúrate de tener OPENAI_API_KEY en tu .env
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def generar_dossier_ejecutivo(tema_reunion: str, participantes: str):
    """
    Función maestra que redacta el dossier. 
    En el futuro, aquí conectaremos la lógica de Sec_Edgar_Api.
    """
    
    # El "System Prompt" define la personalidad de tu IA
    instrucciones = (
        "Eres un asistente de inteligencia de negocios experto. "
        "Tu objetivo es preparar a un ejecutivo para una reunión, "
        "entregando contexto relevante de forma breve y profesional."
    )
    
    # El "User Prompt" es lo que le pedimos específicamente
    cuerpo_pedido = f"""
    Prepara un dossier para la siguiente reunión:
    TEMA: {tema_reunion}
    PARTICIPANTES: {participantes}
    
    Por favor, entrega:
    1. Un resumen del objetivo.
    2. Contexto sugerido para cada participante.
    3. Tres preguntas clave para liderar la conversación.
    """

    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo", # Puedes usar "gpt-4o" si tienes créditos
            messages=[
                {"role": "system", "content": instrucciones},
                {"role": "user", "content": cuerpo_pedido}
            ],
            temperature=0.7 # Un toque de creatividad, pero profesional
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Error de conexión con OpenAI: {str(e)}"
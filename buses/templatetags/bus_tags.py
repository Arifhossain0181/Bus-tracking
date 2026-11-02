from django import template

register = template.Library()

@register.filter
def get_item(dictionary, key):
    """Get an item from a dictionary by key."""
    if dictionary is None:
        return None
    return dictionary.get(key)

@register.filter
def in_dict(key, dictionary):
    """Check if key is in dictionary."""
    if dictionary is None:
        return False
    return key in dictionary
